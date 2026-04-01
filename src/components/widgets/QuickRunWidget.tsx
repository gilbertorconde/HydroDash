import { Link } from '@tanstack/react-router'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { JsonAll } from '../../api/types'
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
  runProgram: UseMutationResult<
    void,
    Error,
    { pid: number; uwt: 0 | 1; qo?: number },
    unknown
  >
  runAction: (task: () => Promise<unknown>, successMessage: string) => Promise<void>
}

export function QuickRunWidget({ ja, runnablePrograms, runProgram, runAction }: Props) {
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
          {runnablePrograms.map(({ pid, name, zones, uwt }) => (
            <li key={pid} className={styles.runRow}>
              <div className={styles.runRowText}>
                <span className={styles.runName}>{name}</span>
                <span className={styles.runZones}>
                  {zones} zone{zones === 1 ? '' : 's'}
                </span>
              </div>
              <Button
                variant="secondary"
                className={styles.runBtn}
                disabled={runProgram.isPending}
                onClick={() =>
                  runAction(
                    () =>
                      runProgram.mutateAsync({
                        pid,
                        uwt,
                        qo: 2,
                      }),
                    `Program “${name}” queued.`,
                  )
                }
              >
                Run
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Link to="/programs" className={styles.widgetLink}>
        Programs →
      </Link>
    </div>
  )
}
