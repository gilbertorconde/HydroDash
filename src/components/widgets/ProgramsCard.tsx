import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { UseMutationResult } from '@tanstack/react-query'
import { ListChecks, Play, Square } from 'lucide-react'
import { CONTROLLER_ACTION_UI_TIMEOUT_MS } from '../../lib/opensprinklerRuntime'
import { formatMinutesWall } from '../../lib/formatLocale'
import { programGradient } from '../../lib/schedulePreview'
import { Card, EmptyState, Spinner } from '../ui'
import { dayLabel, type NextScheduledRun } from './dashboardShared'
import styles from './dashboardWidgets.module.css'

export type RunnableProgram = {
  pid: number
  name: string
  zones: number
  /** Sum of zone durations (minutes). */
  minutes: number
  uwt: 0 | 1
}

type Props = {
  id?: string
  className?: string
  loading: boolean
  runnablePrograms: RunnableProgram[]
  /** Program indices (0-based) that have at least one zone watering right now for that program. */
  runningPids: ReadonlySet<number>
  /** Next scheduled start per program (from the schedule preview). */
  nextByPid: ReadonlyMap<number, NextScheduledRun>
  is24Hour: boolean
  runProgram: UseMutationResult<void, Error, { pid: number; uwt: 0 | 1; qo?: number }, unknown>
  stopProgramStations: (pid: number) => Promise<void>
  stopMutationPending: boolean
  runAction: (task: () => Promise<unknown>, successMessage: string) => Promise<void>
  /** After a successful `/mp` from this card; needed because firmware reports `ps[][0] >= 99`, not program id. */
  onQuickRunStarted?: (pid: number) => void
}

/** Quick run / stop for each runnable program. Run replaces the queue (`/mp qo=2`). */
export function ProgramsCard({
  id,
  className,
  loading,
  runnablePrograms,
  runningPids,
  nextByPid,
  is24Hour,
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
    <Card
      id={id}
      className={className}
      title="Programs"
      subtitle="Run now replaces the queue"
      icon={<ListChecks size={18} aria-hidden />}
      titleAction={<Link to="/programs">All programs</Link>}
    >
      {loading ? (
        <Spinner />
      ) : runnablePrograms.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={22} aria-hidden />}
          title="Nothing to run yet"
          description="Enable a program and give it zone durations in Programs, then run it from here."
        />
      ) : (
        <ul className={styles.progList}>
          {runnablePrograms.map(({ pid, name, zones, minutes, uwt }) => {
            const running = runningPids.has(pid)
            const startingThis = startingPid === pid && !running
            const runBlocked =
              runProgram.isPending || stopMutationPending || (startingPid !== null && !running)
            const next = nextByPid.get(pid)
            const detail = [
              `${zones} zone${zones === 1 ? '' : 's'}`,
              `${minutes} min`,
              running
                ? 'running now'
                : next
                  ? `next ${dayLabel(next.dayOffset, next.weekday)} ${formatMinutesWall(next.startMin, is24Hour)}`
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={pid} className={styles.progRow}>
                <span className={styles.progIcon} style={{ background: programGradient(pid) }} aria-hidden>
                  {pid + 1}
                </span>
                <span className={styles.progText}>
                  <strong>{name}</strong>
                  <span className={running ? styles.progRunning : undefined}>{detail}</span>
                </span>
                <button
                  type="button"
                  className={[
                    styles.playBtn,
                    running ? styles.playBtnStop : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={running ? stopMutationPending : runBlocked}
                  aria-busy={startingThis}
                  aria-label={startingThis ? `Starting ${name}` : running ? `Stop ${name}` : `Run ${name} now`}
                  title={startingThis ? 'Starting…' : running ? 'Stop' : 'Run now'}
                  onClick={() =>
                    running
                      ? runAction(() => stopProgramStations(pid), `Program “${name}” stopped.`)
                      : runAction(async () => {
                          setStartingPid(pid)
                          try {
                            await runProgram.mutateAsync({ pid, uwt, qo: 2 })
                            onQuickRunStarted?.(pid)
                          } catch (e) {
                            setStartingPid(null)
                            throw e
                          }
                        }, `Program “${name}” started.`)
                  }
                >
                  {startingThis ? (
                    <Spinner />
                  ) : running ? (
                    <Square size={14} fill="currentColor" aria-hidden />
                  ) : (
                    <Play size={16} fill="currentColor" aria-hidden />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
