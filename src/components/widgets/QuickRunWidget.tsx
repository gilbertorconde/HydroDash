import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { JsonAll } from '../../api/types'
import { CONTROLLER_ACTION_UI_TIMEOUT_MS } from '../../lib/opensprinklerRuntime'
import { Button, Spinner } from '../ui'
import styles from './dashboardWidgets.module.css'

export type RunnableProgram = {
  pid: number
  name: string
  zones: number
  uwt: 0 | 1
}

type Props = {
  ja: UseQueryResult<JsonAll, Error>
  runnablePrograms: RunnableProgram[]
  /** Program indices (0-based) that have at least one zone watering right now for that program. */
  runningPids: ReadonlySet<number>
  runProgram: UseMutationResult<
    void,
    Error,
    { pid: number; uwt: 0 | 1; qo?: number },
    unknown
  >
  stopProgramStations: (pid: number) => Promise<void>
  stopMutationPending: boolean
  runAction: (task: () => Promise<unknown>, successMessage: string) => Promise<void>
  /** After a successful `/mp` from this widget; needed because firmware reports `ps[][0] >= 99`, not program id. */
  onQuickRunStarted?: (pid: number) => void
}

export function QuickRunWidget({
  ja,
  runnablePrograms,
  runningPids,
  runProgram,
  stopProgramStations,
  stopMutationPending,
  runAction,
  onQuickRunStarted,
}: Props) {
  const [startingPid, setStartingPid] = useState<number | null>(null)
  const startingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (startingPid === null) return
    if (!runningPids.has(startingPid)) return
    if (startingWatchdogRef.current) {
      clearTimeout(startingWatchdogRef.current)
      startingWatchdogRef.current = null
    }
    queueMicrotask(() => setStartingPid(null))
  }, [startingPid, runningPids])

  useEffect(() => {
    if (startingPid === null) return
    startingWatchdogRef.current = setTimeout(() => {
      startingWatchdogRef.current = null
      setStartingPid(null)
    }, CONTROLLER_ACTION_UI_TIMEOUT_MS)
    return () => {
      if (startingWatchdogRef.current) {
        clearTimeout(startingWatchdogRef.current)
        startingWatchdogRef.current = null
      }
    }
  }, [startingPid])

  return (
    <div className={styles.widgetStack}>
      <p className={styles.widgetMeta}>Run a full program on the controller.</p>
      {ja.isLoading && !ja.data ? (
        <Spinner />
      ) : runnablePrograms.length === 0 ? (
        <p className={styles.widgetEmpty}>
          Nothing to run yet. Add zone durations in Programs, then run them here.
        </p>
      ) : (
        <ul className={styles.runList}>
          {runnablePrograms.map(({ pid, name, zones, uwt }) => {
            const running = runningPids.has(pid)
            const startingThis = startingPid === pid && !running
            const runBlocked =
              runProgram.isPending || stopMutationPending || (startingPid !== null && !running)
            return (
              <li key={pid} className={styles.runRow}>
                <div className={styles.runRowText}>
                  <span className={styles.runName}>{name}</span>
                  <span className={styles.runZones}>
                    {zones} zone{zones === 1 ? '' : 's'}
                  </span>
                </div>
                <Button
                  variant={running ? 'danger' : 'secondary'}
                  className={[styles.runBtn, startingThis ? styles.runBtnStarting : ''].filter(Boolean).join(' ')}
                  disabled={running ? stopMutationPending : runBlocked}
                  aria-busy={startingThis}
                  startIcon={startingThis ? <Spinner /> : undefined}
                  onClick={() =>
                    running
                      ? runAction(
                          () => stopProgramStations(pid),
                          `Program “${name}” stopped.`,
                        )
                      : runAction(async () => {
                          setStartingPid(pid)
                          try {
                            await runProgram.mutateAsync({
                              pid,
                              uwt,
                              qo: 2,
                            })
                            onQuickRunStarted?.(pid)
                          } catch (e) {
                            setStartingPid(null)
                            throw e
                          }
                        }, `Program “${name}” queued.`)
                  }
                >
                  {startingThis ? 'Starting…' : running ? 'Stop' : 'Run'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <Link to="/programs" className={styles.widgetLink}>
        Programs →
      </Link>
    </div>
  )
}
