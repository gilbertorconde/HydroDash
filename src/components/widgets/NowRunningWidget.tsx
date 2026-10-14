import { useEffect, useState } from 'react'
import { Button, Spinner } from '../ui'
import { formatMinutesWall } from '../../lib/formatLocale'
import { formatDurationShort } from '../../lib/irrigationLog'
import type { NextScheduledRun, QueuedZone, RunningZone } from './dashboardShared'
import styles from './dashboardWidgets.module.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Queued zones listed inline before collapsing into "+N more". */
const UP_NEXT_MAX = 4

type Props = {
  showSpinner: boolean
  running: RunningZone[]
  queued: QueuedZone[]
  /** `dataUpdatedAt` (ms) of the `/jc` poll the remaining times come from. */
  fetchedAt: number
  /** Queue paused on the controller: countdowns are frozen. */
  paused: boolean
  next: NextScheduledRun | null
  is24Hour: boolean
  stopPending: boolean
  onStopZone: (zone: RunningZone) => void
  onStopAll: () => void
}

/** `m:ss` or `h:mm:ss`. */
function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function formatNextRun(next: NextScheduledRun, is24Hour: boolean): string {
  const time = formatMinutesWall(next.startMin, is24Hour)
  const day =
    next.dayOffset === 0 ? '' : next.dayOffset === 1 ? 'tomorrow ' : `${WEEKDAYS[next.weekday]} `
  return `${next.name} ${day}at ${time}`
}

export function NowRunningWidget({
  showSpinner,
  running,
  queued,
  fetchedAt,
  paused,
  next,
  is24Hour,
  stopPending,
  onStopZone,
  onStopAll,
}: Props) {
  const [now, setNow] = useState(() => Date.now())
  const ticking = running.length > 0 && !paused

  /** Local 1 s tick so countdowns move between 5 s controller polls. */
  useEffect(() => {
    if (!ticking) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [ticking])

  if (showSpinner) return <Spinner />

  const sincePollSec = ticking ? Math.max(0, (now - fetchedAt) / 1000) : 0

  if (running.length === 0 && queued.length === 0) {
    return (
      <p className={styles.nowIdle}>
        <span className={styles.nowIdleDot} aria-hidden />
        Nothing running
        {next ? (
          <span className={styles.widgetMetaMuted}> · next: {formatNextRun(next, is24Hour)}</span>
        ) : null}
      </p>
    )
  }

  const upNext = queued.slice(0, UP_NEXT_MAX)
  const moreQueued = queued.length - upNext.length

  return (
    <div className={styles.widgetStack}>
      {paused ? <p className={styles.widgetMeta}>Queue paused — timers are on hold.</p> : null}
      {running.length > 0 ? (
        <ul className={styles.nowList}>
          {running.map((z) => {
            const left = Math.max(0, z.remainingSec - sincePollSec)
            const pct =
              z.totalSec && z.totalSec > 0
                ? Math.min(100, Math.max(0, ((z.totalSec - left) / z.totalSec) * 100))
                : null
            return (
              <li key={z.sid} className={styles.nowRow}>
                <div className={styles.nowRowMain}>
                  <div className={styles.runRowText}>
                    <span className={styles.runName}>{z.name}</span>
                    <span className={styles.runZones}>{z.programLabel}</span>
                  </div>
                  <span className={styles.nowCountdown} aria-label="Time remaining">
                    {z.remainingSec > 0 ? (left > 0 ? formatCountdown(left) : 'Finishing…') : '—'}
                  </span>
                  <Button
                    variant="secondary"
                    className={styles.runBtn}
                    disabled={stopPending}
                    aria-label={`Stop ${z.name}`}
                    onClick={() => onStopZone(z)}
                  >
                    Stop
                  </Button>
                </div>
                {pct != null ? (
                  <div
                    className={styles.nowProgress}
                    role="progressbar"
                    aria-label={`${z.name} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(pct)}
                  >
                    <div className={styles.nowProgressFill} style={{ width: `${pct}%` }} />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className={styles.widgetEmpty}>Nothing watering right now.</p>
      )}
      {upNext.length > 0 ? (
        <p className={styles.widgetMeta}>
          <span className={styles.nowUpNextLabel}>Up next:</span>{' '}
          {upNext.map((z) => `${z.name} (${formatDurationShort(z.durationSec)})`).join(' · ')}
          {moreQueued > 0 ? ` · +${moreQueued} more` : ''}
        </p>
      ) : null}
      <Button variant="danger" className={styles.nowStopAll} disabled={stopPending} onClick={onStopAll}>
        Stop all
      </Button>
    </div>
  )
}
