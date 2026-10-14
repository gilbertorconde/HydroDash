import type { UseMutationResult } from '@tanstack/react-query'
import { Button, OverflowMenu, Spinner } from '../ui'
import styles from './dashboardWidgets.module.css'

type Settings = Record<string, unknown> | undefined

type Props = {
  showSpinner: boolean
  settings: Settings
  cv: UseMutationResult<void, Error, Record<string, string | number>, unknown>
  pq: UseMutationResult<void, Error, { dur?: number; repl?: number }, unknown>
  formatTime: (epoch?: number) => string
  runAction: (task: () => Promise<unknown>, successMessage: string) => Promise<void>
}

export function LiveStatusWidget({
  showSpinner,
  settings,
  cv,
  pq,
  formatTime,
  runAction,
}: Props) {
  return (
    <>
      {showSpinner ? <Spinner /> : null}
      {settings ? (
        <dl className={styles.dl}>
          <dt>Device time</dt>
          <dd>{formatTime(settings.devt as number)}</dd>
          <dt>Operation</dt>
          <dd>
            {settings.en ? (
              <span className={styles.on}>Enabled</span>
            ) : (
              <span className={styles.off}>Disabled</span>
            )}
          </dd>
          <dt>Rain delay</dt>
          <dd>
            {settings.rd ? `Until ${formatTime(settings.rdst as number)}` : 'Off'}
          </dd>
          <dt>Queue</dt>
          <dd>{Number(settings.nq ?? 0)} zone(s)</dd>
          <dt>Pause</dt>
          <dd>
            {settings.pq ? `Active (${settings.pt ?? 0}s left)` : 'Not paused'}
          </dd>
        </dl>
      ) : null}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={cv.isPending}
          onClick={() => runAction(() => cv.mutateAsync({ rrsn: 1 }), 'Running stations stopped.')}
        >
          Stop running stations
        </Button>
        <Button
          variant="secondary"
          disabled={pq.isPending}
          onClick={async () => {
            if (settings?.pq) {
              await runAction(() => pq.mutateAsync({ dur: 1 }), 'Pause cancelled.')
            } else if (window.confirm('Pause watering for 10 minutes?'))
              await runAction(() => pq.mutateAsync({ dur: 600 }), 'Queue paused for 10 minutes.')
          }}
        >
          {settings?.pq ? 'Resume (cancel pause)' : 'Pause 10 min'}
        </Button>
        <OverflowMenu
          label="More controller actions"
          items={[
            {
              label: settings?.en ? 'Disable operation' : 'Enable operation',
              danger: Boolean(settings?.en),
              disabled: cv.isPending,
              onSelect: () => {
                if (
                  settings?.en &&
                  !window.confirm(
                    'Disable operation? Scheduled programs will not run until operation is enabled again.',
                  )
                ) {
                  return
                }
                void runAction(
                  () => cv.mutateAsync({ en: settings?.en ? 0 : 1 }),
                  settings?.en ? 'Controller disabled.' : 'Controller enabled.',
                )
              },
            },
            {
              label: 'Reset all stations',
              danger: true,
              disabled: cv.isPending,
              onSelect: () => {
                if (!window.confirm('Reset all stations? This stops every running and queued zone.')) return
                void runAction(() => cv.mutateAsync({ rsn: 1 }), 'All stations reset.')
              },
            },
          ]}
        />
      </div>
    </>
  )
}
