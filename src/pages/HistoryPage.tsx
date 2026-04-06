import { useEffect, useMemo, useState } from 'react'
import { useClearAllLogs, useDeleteLog, useJsonAll, useLogs } from '../api/hooks'
import type { JsonAll } from '../api/types'
import { Button, Card, ErrorBox, Input, Label, Spinner } from '../components/ui'
import { formatEpochTimeHmsLocale, formatEpochSecondsLocale } from '../lib/formatLocale'
import { useAppPreferences } from '../lib/appPreferences'
import {
  formatDurationShort,
  localDayKey,
  logSummaryStats,
  parseLogEntries,
  type ParsedLogEvent,
} from '../lib/irrigationLog'
import styles from './HistoryPage.module.css'

const ONE_DAY_SECONDS = 24 * 60 * 60

function toDateInputValue(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** OpenSprinkler app `logs.js` dates() + parms(): start = local midnight, end = end-day midnight + 86340s. */
function localMidnightSec(y: number, mo: number, day: number): number {
  return Math.floor(new Date(y, mo - 1, day).getTime() / 1000)
}

function fromDateInputStart(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) return NaN
  return localMidnightSec(y, m, d)
}

function fromDateInputEnd(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) return NaN
  return localMidnightSec(y, m, d) + 86340
}

/** Midnight boundary positions as fraction 0–1 within [startMs, endMs] */
function dayBoundaryFractions(startMs: number, endMs: number): number[] {
  const range = endMs - startMs
  if (range <= 0) return []
  const out: number[] = []
  const d = new Date(startMs)
  d.setHours(0, 0, 0, 0)
  if (d.getTime() < startMs) d.setDate(d.getDate() + 1)
  while (d.getTime() < endMs) {
    const f = (d.getTime() - startMs) / range
    if (f > 0.002 && f < 0.998) out.push(f)
    d.setDate(d.getDate() + 1)
  }
  return out
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function formatDayHeading(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(y!, (m ?? 1) - 1, d)
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function HistoryPage() {
  const prefs = useAppPreferences()
  const hour12 = !prefs.is24Hour
  const ja = useJsonAll()
  const stationsBlock = ja.data?.stations as JsonAll['stations'] | undefined
  const optionsBlock = ja.data?.options as JsonAll['options'] | undefined

  const [initialDates] = useState(() => {
    const now = Date.now()
    return {
      defaultFrom: toDateInputValue(now - 6 * ONE_DAY_SECONDS * 1000),
      defaultTo: toDateInputValue(now),
    }
  })
  const [fromDate, setFromDate] = useState(initialDates.defaultFrom)
  const [toDate, setToDate] = useState(initialDates.defaultTo)
  const [view, setView] = useState<'timeline' | 'table'>('table')
  const [tableGroup, setTableGroup] = useState<'day' | 'station'>('day')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const start = fromDateInputStart(fromDate)
  const end = fromDateInputEnd(toDate)
  const validRange = Number.isFinite(start) && Number.isFinite(end) && end >= start

  const logs = useLogs(start, end, validRange)
  const deleteLog = useDeleteLog()
  const clearAllLogs = useClearAllLogs()

  const rawEntries = useMemo(() => (logs.data ?? []) as unknown[], [logs.data])

  const events = useMemo(() => {
    const snames = stationsBlock?.snames ?? []
    return parseLogEntries(rawEntries, snames, optionsBlock)
  }, [rawEntries, stationsBlock?.snames, optionsBlock])

  const stats = useMemo(() => logSummaryStats(events), [events])

  const { startMs, endMs } = useMemo(
    () => ({ startMs: start * 1000, endMs: end * 1000 }),
    [start, end],
  )
  const rangeTotalMs = endMs - startMs
  const rangeMsSafe = Math.max(1, rangeTotalMs)

  const timelineEvents = useMemo(
    () => events.filter((e) => !(e.stationKind === 'zone' && e.pid === 0)),
    [events],
  )

  const timelineRows = useMemo(() => {
    const zoneOrder = new Map<number, string>()
    for (const e of timelineEvents) {
      if (e.stationKind === 'zone' && e.stationIndex !== null) {
        zoneOrder.set(e.stationIndex, e.stationLabel)
      }
    }
    const zids = [...zoneOrder.keys()].sort((a, b) => a - b)
    const rows: { key: string; label: string }[] = zids.map((id) => ({
      key: `z-${id}`,
      label: zoneOrder.get(id)!,
    }))
    const specials = new Set<string>()
    for (const e of timelineEvents) {
      if (e.stationKind === 'special') specials.add(e.stationLabel)
    }
    ;[...specials].sort((a, b) => a.localeCompare(b)).forEach((label) => {
      rows.push({ key: `s-${label}`, label })
    })
    return rows
  }, [timelineEvents])

  const dayBoundaries = useMemo(() => dayBoundaryFractions(startMs, endMs), [startMs, endMs])

  const timelineMinWidthPx = useMemo(() => {
    const days = Math.max(1, Math.ceil(rangeMsSafe / 86400000))
    return Math.min(2800, Math.max(480, days * 160))
  }, [rangeMsSafe])

  const groupedByDay = useMemo(() => {
    const m = new Map<string, ParsedLogEvent[]>()
    for (const e of events) {
      const k = localDayKey(e.startSec)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [events])

  const groupedByStation = useMemo(() => {
    const m = new Map<string, ParsedLogEvent[]>()
    for (const e of events) {
      const k = e.stationLabel
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [events])

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const showNowLine = nowMs >= startMs && nowMs <= endMs
  const nowFraction = showNowLine ? (nowMs - startMs) / rangeMsSafe : 0

  const runExport = () => {
    downloadJson(`opensprinkler-logs_${fromDate}_${toDate}.json`, rawEntries)
  }

  const runClearAll = async () => {
    setErr(null)
    setMsg(null)
    if (!window.confirm('Clear all irrigation log data on the controller?')) return
    try {
      await clearAllLogs.mutateAsync()
      setMsg('All logs cleared.')
      logs.refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to clear logs')
    }
  }

  const runDeleteDay = async (day: string) => {
    setErr(null)
    setMsg(null)
    if (!window.confirm(`Delete all log entries for ${day}?`)) return
    try {
      await deleteLog.mutateAsync(day)
      setMsg(`Deleted logs for ${day}.`)
      logs.refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete logs')
    }
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>History</h1>
      <p className={styles.lead}>Irrigation log from the controller. Switch between table and timeline.</p>

      <div className={styles.viewToggle} role="tablist" aria-label="Log view">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'table'}
          className={view === 'table' ? styles.segActive : styles.segBtn}
          onClick={() => setView('table')}
        >
          Table
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'timeline'}
          className={view === 'timeline' ? styles.segActive : styles.segBtn}
          onClick={() => setView('timeline')}
        >
          Timeline
        </button>
      </div>

      <details open className={styles.options}>
        <summary className={styles.optionsSummary}>Options</summary>
        <div className={styles.optionsBody}>
          {view === 'table' ? (
            <div className={styles.groupingRow}>
              <span className={styles.groupingLabel}>Grouping</span>
              <div className={styles.segment}>
                <button
                  type="button"
                  className={tableGroup === 'day' ? styles.segActive : styles.segBtn}
                  onClick={() => setTableGroup('day')}
                >
                  Day
                </button>
                <button
                  type="button"
                  className={tableGroup === 'station' ? styles.segActive : styles.segBtn}
                  onClick={() => setTableGroup('station')}
                >
                  Station
                </button>
              </div>
            </div>
          ) : (
            <p className={styles.timelineHint}>Timeline spans the full start/end range below. The red line is the current time when it falls in range.</p>
          )}

          <div className={styles.row}>
            <div className={styles.field}>
              <Label htmlFor="log-start">Start</Label>
              <Input id="log-start" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className={styles.field}>
              <Label htmlFor="log-end">End</Label>
              <Input id="log-end" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => logs.refetch()} disabled={!validRange || logs.isFetching}>
                Refresh
              </Button>
            </div>
          </div>

          <div className={styles.actionStack}>
            <Button type="button" variant="secondary" className={styles.fullBtn} onClick={runExport} disabled={rawEntries.length === 0}>
              Export
            </Button>
            <Button
              type="button"
              variant="danger"
              className={styles.fullBtn}
              onClick={runClearAll}
              disabled={clearAllLogs.isPending}
            >
              Clear logs
            </Button>
          </div>
        </div>
      </details>

      {!validRange ? <ErrorBox message="Date range is invalid. End must be on or after start." /> : null}
      {err ? <ErrorBox message={err} /> : null}
      {msg ? <p className={styles.ok}>{msg}</p> : null}

      <div className={styles.summaryBar}>
        <span>
          Total station events: <strong>{stats.totalEvents}</strong>
        </span>
        <span>
          Total runtime: <strong>{formatDurationShort(stats.totalRuntimeSec)}</strong>
        </span>
      </div>

      <Card title={view === 'timeline' ? 'Timeline' : 'Log'} variant="plain" bodyClassName={styles.cardBodyFlush}>
        {logs.isLoading ? <Spinner /> : null}
        {logs.isError ? (
          <ErrorBox message={logs.error instanceof Error ? logs.error.message : 'Failed to load history'} />
        ) : null}

        {!logs.isLoading && !logs.isError && events.length === 0 ? (
          <p className={styles.muted}>No log entries for this range.</p>
        ) : null}

        {view === 'timeline' && !logs.isLoading && !logs.isError && events.length > 0 ? (
          <div className={styles.timelineWrap}>
            {timelineRows.length === 0 ? (
              <p className={styles.muted}>No events to show on the timeline (after filters).</p>
            ) : (
              <>
                <div className={styles.axisTop}>
                  <span>{formatEpochSecondsLocale(Math.floor(startMs / 1000), { hour12 })}</span>
                  <span>{formatEpochSecondsLocale(Math.floor(endMs / 1000), { hour12 })}</span>
                </div>
                <div className={styles.timelineGrid}>
                  <div className={styles.timelineLabels}>
                    {timelineRows.map((r) => (
                      <div key={r.key} className={styles.timelineLabelRow}>
                        {r.label}
                      </div>
                    ))}
                  </div>
                  <div className={styles.timelineScroll}>
                    <div className={styles.timelineInner} style={{ minWidth: timelineMinWidthPx }}>
                      <div className={styles.timelineOverlays} aria-hidden>
                        {dayBoundaries.map((f, i) => (
                          <div key={`d-${i}`} className={styles.dayLine} style={{ left: `${f * 100}%` }} />
                        ))}
                        {showNowLine ? (
                          <div className={styles.nowLine} style={{ left: `${nowFraction * 100}%` }} title="Now" />
                        ) : null}
                      </div>
                      {timelineRows.map((r) => (
                        <div key={r.key} className={styles.timelineTrack}>
                          {timelineEvents
                            .filter((e) =>
                              e.stationKind === 'zone' && e.stationIndex !== null
                                ? `z-${e.stationIndex}` === r.key
                                : `s-${e.stationLabel}` === r.key,
                            )
                            .map((e, i) => {
                              const left = Math.max(
                                0,
                                Math.min(100, ((e.startSec * 1000 - startMs) / rangeMsSafe) * 100),
                              )
                              const w = Math.max(
                                0.15,
                                Math.min(100 - left, ((e.endSec - e.startSec) * 1000 / rangeMsSafe) * 100),
                              )
                              const hue = (e.pid * 47) % 360
                              return (
                                <div
                                  key={`${e.startSec}-${i}`}
                                  className={styles.timelineBlock}
                                  style={{
                                    left: `${left}%`,
                                    width: `${w}%`,
                                    background: `hsl(${hue} 52% 42%)`,
                                  }}
                                  title={`${e.stationLabel} · ${formatDurationShort(e.durationSec)} · ${formatEpochSecondsLocale(e.startSec, { hour12 })}–${formatEpochSecondsLocale(e.endSec, { hour12 })}`}
                                />
                              )
                            })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}

        {view === 'table' && !logs.isLoading && !logs.isError && events.length > 0 ? (
          <div className={styles.tableView}>
            {tableGroup === 'day'
              ? groupedByDay.map(([day, evs]) => (
                  <details key={day} className={styles.group}>
                    <summary className={styles.groupSummary}>
                      <span className={styles.groupTitle}>
                        {formatDayHeading(day)} · {evs.length} run{evs.length === 1 ? '' : 's'}
                      </span>
                      <Button
                        type="button"
                        variant="danger"
                        className={styles.groupDelete}
                        disabled={deleteLog.isPending}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          void runDeleteDay(day)
                        }}
                      >
                        Delete
                      </Button>
                    </summary>
                    <div className={styles.tableScroll}>
                      <table className={styles.dataTable}>
                        <thead>
                          <tr>
                            <th>Station</th>
                            <th>Runtime</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Flow</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evs
                            .sort((a, b) => a.startSec - b.startSec)
                            .map((e, i) => (
                              <tr key={`${day}-${e.startSec}-${i}`}>
                                <td>{e.stationLabel}</td>
                                <td>{formatDurationShort(e.durationSec)}</td>
                                <td>{formatEpochTimeHmsLocale(e.startSec, { hour12 })}</td>
                                <td>{formatEpochTimeHmsLocale(e.endSec, { hour12 })}</td>
                                <td>{e.flowRate != null ? String(e.flowRate) : '—'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))
              : groupedByStation.map(([label, evs]) => (
                  <details key={label} className={styles.group}>
                    <summary className={styles.groupSummary}>
                      <span className={styles.groupTitle}>
                        {label} · {evs.length} run{evs.length === 1 ? '' : 's'}
                      </span>
                    </summary>
                    <div className={styles.tableScroll}>
                      <table className={styles.dataTable}>
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Runtime</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Flow</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evs
                            .sort((a, b) => a.startSec - b.startSec)
                            .map((e, i) => (
                              <tr key={`${label}-${e.startSec}-${i}`}>
                                <td>{formatDayHeading(localDayKey(e.startSec))}</td>
                                <td>{formatDurationShort(e.durationSec)}</td>
                                <td>{formatEpochTimeHmsLocale(e.startSec, { hour12 })}</td>
                                <td>{formatEpochTimeHmsLocale(e.endSec, { hour12 })}</td>
                                <td>{e.flowRate != null ? String(e.flowRate) : '—'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
          </div>
        ) : null}
      </Card>
    </div>
  )
}
