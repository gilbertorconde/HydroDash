import { Link } from '@tanstack/react-router'
import { CalendarClock, Droplet, ListOrdered } from 'lucide-react'
import { Card, EmptyState, Spinner } from '../ui'
import { formatMinutesWall } from '../../lib/formatLocale'
import {
  dayLabel,
  formatDeviceClock,
  formatMinutesLong,
  type NextScheduledRun,
  type QueuedZone,
} from './dashboardShared'
import styles from './dashboardWidgets.module.css'

type Props = {
  loading: boolean
  /** Zones waiting in the controller queue (soonest first). */
  queued: QueuedZone[]
  /** Scheduled program starts in the coming week, shown when the queue is empty. */
  upcoming: NextScheduledRun[]
  is24Hour: boolean
  className?: string
}

/** Horizontal strip of queued zones, or the coming scheduled runs when nothing is queued. */
export function UpNextCard({ loading, queued, upcoming, is24Hour, className }: Props) {
  const showQueue = queued.length > 0
  return (
    <Card
      className={className}
      title="Up next"
      subtitle={
        showQueue
          ? `${queued.length} zone${queued.length === 1 ? '' : 's'} in the queue`
          : 'Scheduled runs this week'
      }
      icon={<ListOrdered size={18} aria-hidden />}
      titleAction={showQueue ? <Link to="/zones">Zones</Link> : <Link to="/preview">Schedule</Link>}
    >
      {loading ? (
        <Spinner />
      ) : showQueue ? (
        <ul className={styles.strip} aria-label="Queued zones">
          {queued.map((z) => (
            <li key={z.sid} className={styles.stripItem}>
              <span className={styles.stripIcon}>
                <Droplet size={17} aria-hidden />
              </span>
              <strong className={styles.stripName}>{z.name}</strong>
              <span className={styles.stripMeta}>
                {z.startSec > 0 ? formatDeviceClock(z.startSec, is24Hour) : 'Waiting'}
              </span>
              <span className={styles.stripMeta}>{formatMinutesLong(z.durationSec / 60)}</span>
            </li>
          ))}
        </ul>
      ) : upcoming.length > 0 ? (
        <ul className={styles.strip} aria-label="Upcoming scheduled runs">
          {upcoming.map((r, i) => (
            <li key={`${r.pid}-${r.dayOffset}-${r.startMin}-${i}`} className={styles.stripItem}>
              <span className={`${styles.stripIcon} ${styles.stripIconSchedule}`}>
                <CalendarClock size={17} aria-hidden />
              </span>
              <strong className={styles.stripName}>{r.name}</strong>
              <span className={styles.stripMeta}>
                {dayLabel(r.dayOffset, r.weekday)} {formatMinutesWall(r.startMin, is24Hour)}
              </span>
              <span className={styles.stripMeta}>{formatMinutesLong(r.durationMin)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<CalendarClock size={22} aria-hidden />}
          title="Nothing queued"
          description="No program runs are scheduled in the next 7 days."
        />
      )}
    </Card>
  )
}
