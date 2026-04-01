import { Link } from '@tanstack/react-router'
import type { UseQueryResult } from '@tanstack/react-query'
import { Spinner } from '../ui'
import { formatDurationShort, type ParsedLogEvent } from '../../lib/irrigationLog'
import styles from './dashboardWidgets.module.css'

type Props = {
  logs: UseQueryResult<unknown[], Error>
  logEvents: ParsedLogEvent[]
  historyPreview: ParsedLogEvent[]
  formatTime: (epoch?: number) => string
}

export function HistoryWidget({ logs, logEvents, historyPreview, formatTime }: Props) {
  return (
    <div className={styles.widgetStack}>
      <p className={styles.widgetMeta}>
        Yesterday and today (local){' '}
        <span className={styles.widgetMetaMuted}>
          · {logEvents.length} event{logEvents.length === 1 ? '' : 's'}
        </span>
      </p>
      {logs.isLoading && !logs.data ? (
        <Spinner />
      ) : logs.isError ? (
        <p className={styles.widgetError}>
          {logs.error instanceof Error ? logs.error.message : 'Could not load logs.'}
        </p>
      ) : historyPreview.length === 0 ? (
        <p className={styles.widgetEmpty}>No log entries in the last two days.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Station</th>
                <th scope="col">Duration</th>
              </tr>
            </thead>
            <tbody>
              {historyPreview.map((ev, i) => (
                <tr key={`${ev.startSec}-${ev.stationLabel}-${ev.pid}-${i}`}>
                  <td className={styles.cellTime}>{formatTime(ev.startSec)}</td>
                  <td className={styles.cellStation}>{ev.stationLabel}</td>
                  <td>{formatDurationShort(ev.durationSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link to="/history" className={styles.widgetLink}>
        Full history →
      </Link>
    </div>
  )
}
