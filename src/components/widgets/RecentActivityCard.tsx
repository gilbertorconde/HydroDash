import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { UseQueryResult } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Button, Card, EmptyState, Spinner } from '../ui'
import { formatDurationShort, type ParsedLogEvent } from '../../lib/irrigationLog'
import { formatDeviceDateTime } from './dashboardShared'
import styles from './dashboardWidgets.module.css'

/** Rows shown before "Show more"; the full preview holds up to 28. */
const COLLAPSED_ROWS = 6

type Props = {
  className?: string
  logs: UseQueryResult<unknown[], Error>
  logEvents: ParsedLogEvent[]
  /** Newest first. */
  historyPreview: ParsedLogEvent[]
  devt: number | undefined
  is24Hour: boolean
}

/** Last runs from `/jl` (yesterday + today). */
export function RecentActivityCard({ className, logs, logEvents, historyPreview, devt, is24Hour }: Props) {
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? historyPreview : historyPreview.slice(0, COLLAPSED_ROWS)
  return (
    <Card
      className={className}
      title="Recent activity"
      subtitle={`Yesterday and today · ${logEvents.length} event${logEvents.length === 1 ? '' : 's'}`}
      icon={<History size={18} aria-hidden />}
      titleAction={<Link to="/history">Full history</Link>}
    >
      {logs.isLoading && !logs.data ? (
        <Spinner />
      ) : logs.isError ? (
        <p className={styles.error}>
          {logs.error instanceof Error ? logs.error.message : 'Could not load logs.'}
        </p>
      ) : historyPreview.length === 0 ? (
        <EmptyState
          icon={<History size={22} aria-hidden />}
          title="No watering yet"
          description="Nothing has run yesterday or today."
        />
      ) : (
        <>
          <ul className={styles.activity}>
            {rows.map((ev, i) => (
              <li key={`${ev.startSec}-${ev.stationLabel}-${ev.pid}-${i}`} className={styles.activityRow}>
                <span className={styles.activityDot} aria-hidden />
                <span className={styles.activityText}>
                  <strong>{ev.stationLabel}</strong>
                  <span>{formatDeviceDateTime(ev.startSec, devt, is24Hour)}</span>
                </span>
                <span className={styles.activityDur}>{formatDurationShort(ev.durationSec)}</span>
              </li>
            ))}
          </ul>
          {historyPreview.length > COLLAPSED_ROWS ? (
            <Button variant="ghost" size="sm" className={styles.moreBtn} onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show less' : `Show ${historyPreview.length - COLLAPSED_ROWS} more`}
            </Button>
          ) : null}
        </>
      )}
    </Card>
  )
}
