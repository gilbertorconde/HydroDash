import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, ChevronDown, Clock, Download, History as HistoryIcon, RefreshCw, Trash2 } from 'lucide-react'
import { useClearAllLogs, useDeleteLog, useJsonAll, useLogs } from '../api/hooks'
import type { JsonAll } from '../api/types'
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  OverflowMenu,
  PageBody,
  PageHero,
  Segmented,
  Spinner,
} from '../components/ui'
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

/**
 * OpenSprinkler app `logs.js` dates() + parms(): start = midnight, end = end-day midnight + 86340s.
 * Controller epochs are its local wall clock encoded as UTC, so midnight is a UTC midnight.
 */
function localMidnightSec(y: number, mo: number, day: number): number {
  return Math.floor(Date.UTC(y, mo - 1, day) / 1000)
}

/** Browser "now" on the controller's wall-clock scale (assumes both share a time zone). */
function controllerNowMs(): number {
  return Date.now() - new Date().getTimezoneOffset() * 60_000
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
  d.setUTCHours(0, 0, 0, 0)
  if (d.getTime() < startMs) d.setUTCDate(d.getUTCDate() + 1)
  while (d.getTime() < endMs) {
    const f = (d.getTime() - startMs) / range
    if (f > 0.002 && f < 0.998) out.push(f)
    d.setUTCDate(d.getUTCDate() + 1)
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

/** Short "Oct 8" label for a date input value; adds the year when it isn't the current one. */
function formatShortDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return value || '—'
  const dt = new Date(y, m - 1, d)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (y !== new Date().getFullYear()) opts.year = 'numeric'
  return dt.toLocaleDateString(undefined, opts)
}

/** Stable per-program colour for timeline blocks and the legend (works on light and dark surfaces). */
function programColor(pid: number): string {
  if (pid === 99) return 'var(--color-accent)'
  if (pid === 254) return 'var(--color-advanced)'
  const hue = (pid * 47 + 190) % 360
  return `hsl(${hue} 62% 50%)`
}

function programLabel(pid: number, names: string[]): string {
  if (pid === 99) return 'Manual'
  if (pid === 254) return 'Run once'
  if (pid === 0) return 'Sensor / delay'
  return names[pid - 1]?.trim() || `Program ${pid}`
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
  /** The range/grouping options collapse to a one-line summary until "Change" is tapped. */
  const [optionsOpen, setOptionsOpen] = useState(false)
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

  const [nowMs, setNowMs] = useState(controllerNowMs)
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(controllerNowMs()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  /** Long ranges scroll horizontally; start scrolled to the most recent end. */
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = timelineScrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [view, timelineMinWidthPx, timelineRows.length])

  const showNowLine = nowMs >= startMs && nowMs <= endMs
  const nowFraction = showNowLine ? (nowMs - startMs) / rangeMsSafe : 0

  const runExport = () => {
    downloadJson(`opensprinkler-logs_${fromDate}_${toDate}.json`, rawEntries)
  }

  const programNames = useMemo(
    () => (ja.data?.programs?.pd ?? []).map((p) => (typeof p?.[5] === 'string' ? p[5] : '')),
    [ja.data?.programs?.pd],
  )

  const legend = useMemo(() => {
    const pids = [...new Set(timelineEvents.map((e) => e.pid))].sort((a, b) => a - b)
    return pids.map((pid) => ({ pid, label: programLabel(pid, programNames), color: programColor(pid) }))
  }, [timelineEvents, programNames])

  const rangeSummary = `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`
  const optionsSummary = view === 'timeline' ? rangeSummary : `${rangeSummary} · by ${tableGroup}`

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

  const ready = !logs.isLoading && !logs.isError

  const renderTable = (
    rows: ParsedLogEvent[],
    keyPrefix: string,
    firstCol: 'station' | 'day',
  ) => (
    <table className={styles.dataTable}>
      <thead>
        <tr>
          <th>{firstCol === 'station' ? 'Station' : 'Day'}</th>
          <th>Runtime</th>
          <th>Start</th>
          <th>End</th>
          <th>Flow</th>
        </tr>
      </thead>
      <tbody>
        {[...rows]
          .sort((a, b) => a.startSec - b.startSec)
          .map((e, i) => (
            <tr key={`${keyPrefix}-${e.startSec}-${i}`}>
              <td className={styles.cellMain}>
                <span className={styles.programDot} style={{ background: programColor(e.pid) }} aria-hidden />
                {firstCol === 'station' ? e.stationLabel : formatDayHeading(localDayKey(e.startSec))}
              </td>
              <td className={styles.cellRuntime}>{formatDurationShort(e.durationSec)}</td>
              <td className={styles.cellStart}>
                {formatEpochTimeHmsLocale(e.startSec, { hour12 })}
                <span className={styles.inlineEnd}> – {formatEpochTimeHmsLocale(e.endSec, { hour12 })}</span>
              </td>
              <td className={styles.cellEnd}>{formatEpochTimeHmsLocale(e.endSec, { hour12 })}</td>
              <td className={styles.cellFlow} data-empty={e.flowRate == null || undefined}>
                <span className={styles.flowLabel}>Flow </span>
                {e.flowRate != null ? String(e.flowRate) : '—'}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  )

  return (
    <>
      <PageHero
        title="History"
        subtitle="What ran on the controller, and when."
        actions={
          <>
            <Button
              variant="glass"
              startIcon={<Download size={16} aria-hidden />}
              onClick={runExport}
              disabled={rawEntries.length === 0}
            >
              Export
            </Button>
            <OverflowMenu
              onHero
              label="More history actions"
              items={[
                {
                  label: 'Clear all logs…',
                  danger: true,
                  disabled: clearAllLogs.isPending,
                  onSelect: () => void runClearAll(),
                },
              ]}
            />
          </>
        }
      >
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>
              <HistoryIcon size={14} aria-hidden />
              Station events
            </span>
            <span className={styles.heroStatValue}>{stats.totalEvents}</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>
              <Clock size={14} aria-hidden />
              Total runtime
            </span>
            <span className={styles.heroStatValue}>{formatDurationShort(stats.totalRuntimeSec)}</span>
          </div>
        </div>
      </PageHero>

      <PageBody>
        <section className={styles.controls} aria-label="Log options">
          <div className={styles.controlsRow}>
            <Segmented
              label="Log view"
              value={view}
              onChange={setView}
              options={[
                { value: 'table', label: 'Table' },
                { value: 'timeline', label: 'Timeline' },
              ]}
            />
            <div className={styles.rangeSummary}>
              <CalendarRange size={16} className={styles.rangeIcon} aria-hidden />
              <span className={styles.optionsSummaryText}>{optionsSummary}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={styles.optionsToggle}
                aria-expanded={optionsOpen}
                aria-controls="history-options"
                onClick={() => setOptionsOpen((o) => !o)}
              >
                {optionsOpen ? 'Done' : 'Change'}
              </Button>
            </div>
          </div>
          {optionsOpen ? (
            <div id="history-options" className={styles.optionsBody}>
              {view === 'table' ? (
                <div className={styles.groupingRow}>
                  <span className={styles.groupingLabel}>Group by</span>
                  <Segmented
                    label="Grouping"
                    value={tableGroup}
                    onChange={setTableGroup}
                    options={[
                      { value: 'day', label: 'Day' },
                      { value: 'station', label: 'Station' },
                    ]}
                  />
                </div>
              ) : (
                <p className={styles.timelineHint}>
                  The timeline spans the full range below. The red line marks the current time when it falls in
                  range.
                </p>
              )}
              <div className={styles.dateRow}>
                <Field label="Start" htmlFor="log-start" className={styles.dateField}>
                  <Input id="log-start" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </Field>
                <Field label="End" htmlFor="log-end" className={styles.dateField}>
                  <Input id="log-end" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </Field>
                <Button
                  variant="secondary"
                  className={styles.refreshBtn}
                  startIcon={<RefreshCw size={15} aria-hidden />}
                  onClick={() => logs.refetch()}
                  disabled={!validRange || logs.isFetching}
                >
                  Refresh
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {!validRange ? <ErrorBox message="Date range is invalid. End must be on or after start." /> : null}
        {err ? <ErrorBox message={err} /> : null}
        {msg ? <p className={styles.ok}>{msg}</p> : null}

        <Card
          title={view === 'timeline' ? 'Timeline' : 'Runs'}
          subtitle={rangeSummary}
          icon={view === 'timeline' ? <CalendarRange size={18} aria-hidden /> : <HistoryIcon size={18} aria-hidden />}
          titleAction={logs.isFetching && !logs.isLoading ? <Spinner /> : undefined}
        >
          {logs.isLoading ? (
            <div className={styles.loading}>
              <Spinner />
            </div>
          ) : null}
          {logs.isError ? (
            <ErrorBox message={logs.error instanceof Error ? logs.error.message : 'Failed to load history'} />
          ) : null}

          {ready && events.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon size={22} aria-hidden />}
              title="Nothing ran in this range"
              description="Pick a wider date range with Change, or come back after the next watering."
            />
          ) : null}

          {view === 'timeline' && ready && events.length > 0 ? (
            <div className={styles.timelineWrap}>
              {timelineRows.length === 0 ? (
                <p className={styles.muted}>No events to show on the timeline (manual zone runs are hidden here).</p>
              ) : (
                <>
                  <div className={styles.axisTop}>
                    <span>{formatEpochSecondsLocale(Math.floor(startMs / 1000), { hour12 })}</span>
                    <span>{formatEpochSecondsLocale(Math.floor(endMs / 1000), { hour12 })}</span>
                  </div>
                  <div className={styles.timelineGrid}>
                    <div className={styles.timelineLabels}>
                      {timelineRows.map((r) => (
                        <div key={r.key} className={styles.timelineLabelRow} title={r.label}>
                          {r.label}
                        </div>
                      ))}
                    </div>
                    <div className={styles.timelineScroll} ref={timelineScrollRef}>
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
                                return (
                                  <div
                                    key={`${e.startSec}-${i}`}
                                    className={styles.timelineBlock}
                                    style={{ left: `${left}%`, width: `${w}%`, background: programColor(e.pid) }}
                                    title={`${e.stationLabel} · ${programLabel(e.pid, programNames)} · ${formatDurationShort(e.durationSec)} · ${formatEpochSecondsLocale(e.startSec, { hour12 })}–${formatEpochSecondsLocale(e.endSec, { hour12 })}`}
                                  />
                                )
                              })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {legend.length > 0 ? (
                    <ul className={styles.legend} aria-label="Programs">
                      {legend.map((l) => (
                        <li key={l.pid}>
                          <span className={styles.legendSwatch} style={{ background: l.color }} aria-hidden />
                          {l.label}
                        </li>
                      ))}
                      {showNowLine ? (
                        <li>
                          <span className={styles.legendNow} aria-hidden />
                          Now
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {view === 'table' && ready && events.length > 0 ? (
            <div className={styles.tableView}>
              {tableGroup === 'day'
                ? groupedByDay.map(([day, evs], idx) => (
                    <details key={day} className={styles.group} open={idx === 0}>
                      <summary className={styles.groupSummary}>
                        <ChevronDown size={18} className={styles.groupChevron} aria-hidden />
                        <span className={styles.groupTitle}>{formatDayHeading(day)}</span>
                        <span className={styles.groupMeta}>
                          {evs.length} run{evs.length === 1 ? '' : 's'} ·{' '}
                          {formatDurationShort(evs.reduce((a, e) => a + (e.includeInStats ? e.durationSec : 0), 0))}
                        </span>
                        <button
                          type="button"
                          className={styles.groupDelete}
                          aria-label={`Delete log entries for ${formatDayHeading(day)}`}
                          title="Delete this day's log"
                          disabled={deleteLog.isPending}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void runDeleteDay(day)
                          }}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </summary>
                      <div className={styles.tableScroll}>{renderTable(evs, day, 'station')}</div>
                    </details>
                  ))
                : groupedByStation.map(([label, evs], idx) => (
                    <details key={label} className={styles.group} open={idx === 0}>
                      <summary className={styles.groupSummary}>
                        <ChevronDown size={18} className={styles.groupChevron} aria-hidden />
                        <span className={styles.groupTitle}>{label}</span>
                        <span className={styles.groupMeta}>
                          {evs.length} run{evs.length === 1 ? '' : 's'} ·{' '}
                          {formatDurationShort(evs.reduce((a, e) => a + (e.includeInStats ? e.durationSec : 0), 0))}
                        </span>
                      </summary>
                      <div className={styles.tableScroll}>{renderTable(evs, label, 'day')}</div>
                    </details>
                  ))}
            </div>
          ) : null}
        </Card>
      </PageBody>
    </>
  )
}
