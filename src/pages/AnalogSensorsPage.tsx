import { useMemo, useState } from 'react'
import { Activity, LineChart, Pencil, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  useSensorDelete,
  useSensorGet,
  useSensorList,
  useSensorLog,
  useSensorReadNow,
  useSensorTypes,
} from '../api/hooks'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import { SensorEditorModal } from '../components/SensorEditorModal'
import {
  AdvancedSection,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  OverflowMenu,
  Pill,
  Select,
  Spinner,
} from '../components/ui'
import { formatEpochSecondsLocale } from '../lib/formatLocale'
import type { SensorDataEntry, SensorLogEntry } from '../lib/opensprinklerSensorsApi'
import { sensorNumericData } from '../lib/opensprinklerSensorsApi'
import { useAppPreferences } from '../lib/appPreferences'
import styles from './AnalogSensorsPage.module.css'

function sensorNr(s: Record<string, unknown>): number | null {
  const n = s.nr
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function formatLastRead(epoch: number | undefined, hour12: boolean): string {
  if (epoch == null || !Number.isFinite(epoch) || epoch <= 0) return 'Never read'
  const d = new Date(epoch * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  const time = d.toLocaleTimeString(undefined, { hour12, hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return `Read ${time}`
  return `Read ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}

/** Trim long float readings to something readable (keeps integers as-is). */
function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return String(Math.round(v * 100) / 100)
}

function SensorLogChart({ entries, unit, hour12 }: { entries: SensorLogEntry[]; unit: string; hour12: boolean }) {
  const points = useMemo(() => {
    const list = (entries ?? [])
      .map((e) => ({ t: e.time, v: sensorNumericData(e.data) }))
      .filter((p): p is { t: number; v: number } => p.v != null && Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t)
    return list
  }, [entries])

  if (points.length < 2) {
    return (
      <EmptyState
        icon={<LineChart size={22} aria-hidden />}
        title="Not enough samples"
        description="There are fewer than two logged readings in this window. Try a longer window, or turn on logging for this sensor."
      />
    )
  }

  const t0 = points[0]!.t
  const t1 = points[points.length - 1]!.t
  const vals = points.map((p) => p.v)
  const rawMin = Math.min(...vals)
  const rawMax = Math.max(...vals)
  let vMin = rawMin
  let vMax = rawMax
  if (vMin === vMax) {
    vMin -= 1
    vMax += 1
  }
  const pad = (vMax - vMin) * 0.08 || 0.5
  vMin -= pad
  vMax += pad

  const W = 640
  const H = 180
  const margin = { l: 4, r: 4, t: 10, b: 6 }
  const iw = W - margin.l - margin.r
  const ih = H - margin.t - margin.b

  const xScale = (t: number) => margin.l + ((t - t0) / (t1 - t0 || 1)) * iw
  const yScale = (v: number) => margin.t + (1 - (v - vMin) / (vMax - vMin || 1)) * ih

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t).toFixed(1)} ${yScale(p.v).toFixed(1)}`)
    .join(' ')
  const area = `${d} L ${xScale(t1).toFixed(1)} ${H - margin.b} L ${xScale(t0).toFixed(1)} ${H - margin.b} Z`
  const u = unit ? ` ${unit}` : ''

  return (
    <figure className={styles.chart}>
      <div className={styles.chartRange}>
        <span>
          Min <strong>{formatValue(rawMin)}{u}</strong>
        </span>
        <span>
          Max <strong>{formatValue(rawMax)}{u}</strong>
        </span>
        <span>
          Latest <strong>{formatValue(vals[vals.length - 1]!)}{u}</strong>
        </span>
      </div>
      <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Sensor log chart">
        <defs>
          <linearGradient id="sensorArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={margin.l}
            x2={W - margin.r}
            y1={margin.t + f * ih}
            y2={margin.t + f * ih}
            stroke="var(--color-border)"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill="url(#sensorArea)" />
        <path
          d={d}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className={styles.chartAxis}>
        <span>{formatEpochSecondsLocale(t0, { hour12 })}</span>
        <span>{formatEpochSecondsLocale(t1, { hour12 })}</span>
      </figcaption>
    </figure>
  )
}

export function AnalogSensorsPage() {
  const prefs = useAppPreferences()
  const hour12 = !prefs.is24Hour
  const sl = useSensorList()
  const apiOk = sl.data?.kind === 'ok'
  const listPayload = sl.data?.kind === 'ok' ? sl.data.data : undefined
  const sensors = useMemo(() => listPayload?.sensors ?? [], [listPayload])
  const sg = useSensorGet(apiOk === true)
  const sf = useSensorTypes(apiOk === true)
  const readNow = useSensorReadNow()
  const delSensor = useSensorDelete()
  const sensorTypesList = useMemo(() => sf.data?.sensorTypes ?? [], [sf.data])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'new' | 'edit'>('new')
  const [editorRow, setEditorRow] = useState<Record<string, unknown> | null>(null)

  const valueByNr = useMemo(() => {
    const map = new Map<number, SensorDataEntry>()
    const datas = sg.data?.datas
    if (!Array.isArray(datas)) return map
    for (const row of datas) {
      if (typeof row.nr === 'number' && Number.isFinite(row.nr)) map.set(row.nr, row)
    }
    return map
  }, [sg.data])

  const sensorRows = useMemo(() => {
    return sensors.filter((s) => sensorNr(s) != null) as Record<string, unknown>[]
  }, [sensors])

  const nextNr = useMemo(() => {
    const nrs = sensorRows.map((s) => sensorNr(s)).filter((n): n is number => n != null)
    return nrs.length > 0 ? Math.max(...nrs) + 1 : 1
  }, [sensorRows])

  const [chartNr, setChartNr] = useState(0)
  const [lastHours, setLastHours] = useState(24)
  const [maxSamples, setMaxSamples] = useState(300)

  const effectiveChartNr = useMemo(() => {
    if (chartNr > 0) return chartNr
    const first = sensorRows.map((s) => sensorNr(s)).find((n) => n != null)
    return first ?? 0
  }, [chartNr, sensorRows])

  const so = useSensorLog(effectiveChartNr, lastHours, maxSamples, apiOk === true && effectiveChartNr > 0)

  const chartUnit =
    so.data?.log?.find((e) => e.nr === effectiveChartNr)?.unit ?? valueByNr.get(effectiveChartNr)?.unit ?? ''

  function openNew() {
    setEditorMode('new')
    setEditorRow(null)
    setEditorOpen(true)
  }

  if (sl.isPending) {
    return (
      <MoreSubpageLayout title="Sensors">
        <Card>
          <div className={styles.loading}>
            <Spinner />
          </div>
        </Card>
      </MoreSubpageLayout>
    )
  }

  if (sl.data?.kind === 'unsupported') {
    return (
      <MoreSubpageLayout title="Sensors" subtitle="Live readings and history from extra sensors.">
        <Card>
          <EmptyState
            icon={<Activity size={22} aria-hidden />}
            title="Extended sensors aren’t available"
            description="Analog sensors with readings and history need a controller firmware that includes them. If your hardware has extra sensors attached, update the controller firmware, then open this page again. Rain, soil and flow sensors are still set up under Settings."
          />
        </Card>
        <AdvancedSection id="sensors.unsupported" title="Technical details" description="Why the sensor API isn’t available">
          <p className={styles.mono}>{sl.data.message}</p>
        </AdvancedSection>
      </MoreSubpageLayout>
    )
  }

  const warnings = listPayload?.warnings
  const count = listPayload?.count ?? sensorRows.length
  const typeName = (t: unknown) =>
    typeof t === 'number' ? (sensorTypesList.find((x) => x.type === t)?.name ?? `Type ${t}`) : '—'

  return (
    <MoreSubpageLayout
      title="Sensors"
      subtitle={`${count} sensor${count === 1 ? '' : 's'}${listPayload?.detected != null ? ` · boards ${listPayload.detected}` : ''} · live values refresh every 30 s`}
      actions={
        <>
          <Button variant="light" startIcon={<Plus size={16} aria-hidden />} onClick={openNew}>
            Add sensor
          </Button>
          <Button
            variant="glass"
            startIcon={<RefreshCw size={15} aria-hidden />}
            disabled={readNow.isPending}
            onClick={() => readNow.mutate(0)}
          >
            {readNow.isPending ? 'Reading…' : 'Read all now'}
          </Button>
        </>
      }
    >
      {warnings && warnings.length > 0 ? (
        <div className={styles.warnings} role="status">
          <TriangleAlert size={18} aria-hidden className={styles.warningsIcon} />
          <div>
            <strong>Warnings from controller</strong>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {sg.isError ? <ErrorBox message={sg.error instanceof Error ? sg.error.message : 'Load failed'} /> : null}
      {sf.isError ? (
        <ErrorBox message="Could not load sensor type list; you can still enter a numeric type when adding a sensor." />
      ) : null}
      {delSensor.isError ? (
        <ErrorBox message={delSensor.error instanceof Error ? delSensor.error.message : 'Delete failed'} />
      ) : null}

      {sensorRows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Activity size={22} aria-hidden />}
            title="No sensors configured"
            description="Add a sensor to see its live value and history here."
            action={
              <Button startIcon={<Plus size={16} aria-hidden />} onClick={openNew}>
                Add sensor
              </Button>
            }
          />
        </Card>
      ) : (
        <div className={styles.sensorGrid}>
          {sensorRows.map((s) => {
            const nr = sensorNr(s)!
            const name = typeof s.name === 'string' && s.name.trim() ? s.name : `Sensor ${nr}`
            const row = valueByNr.get(nr)
            const val = sensorNumericData(row?.data)
            const unit = typeof row?.unit === 'string' ? row.unit : ''
            const enabled = s.enable === undefined ? true : Boolean(s.enable)
            const charted = nr === effectiveChartNr
            return (
              <article key={nr} className={`${styles.sensorCard} ${charted ? styles.sensorCardActive : ''}`}>
                <div className={styles.sensorHead}>
                  <span className={styles.sensorIcon}>
                    <Activity size={18} aria-hidden />
                  </span>
                  <div className={styles.sensorTitle}>
                    <h3>{name}</h3>
                    <p>
                      #{nr} · {typeName(s.type)}
                    </p>
                  </div>
                  <OverflowMenu
                    label={`More actions for ${name}`}
                    items={[
                      { label: 'Show in chart', onSelect: () => setChartNr(nr), disabled: charted },
                      {
                        label: 'Remove sensor…',
                        danger: true,
                        disabled: delSensor.isPending,
                        onSelect: () => {
                          if (!window.confirm(`Remove sensor ${nr}?`)) return
                          delSensor.mutate(nr)
                        },
                      },
                    ]}
                  />
                </div>
                <div className={styles.sensorValue}>
                  <span className={styles.sensorNumber}>{val != null ? formatValue(val) : '—'}</span>
                  {unit ? <span className={styles.sensorUnit}>{unit}</span> : null}
                  {!enabled ? (
                    <Pill tone="neutral" className={styles.sensorPill}>
                      Disabled
                    </Pill>
                  ) : null}
                </div>
                <div className={styles.sensorFoot}>
                  <span className={styles.sensorLast}>{formatLastRead(row?.last, hour12)}</span>
                  <span className={styles.sensorActions}>
                    <Button
                      variant="ghost"
                      size="sm"
                      startIcon={<RefreshCw size={14} aria-hidden />}
                      disabled={readNow.isPending}
                      onClick={() => readNow.mutate(nr)}
                    >
                      Read
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      startIcon={<Pencil size={14} aria-hidden />}
                      onClick={() => {
                        setEditorMode('edit')
                        setEditorRow(s)
                        setEditorOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Card title="History" subtitle="Logged readings" icon={<LineChart size={18} aria-hidden />}>
        <div className={styles.chartControls}>
          <Field label="Sensor" htmlFor="sensor-chart-nr" className={styles.chartField}>
            <Select
              id="sensor-chart-nr"
              value={effectiveChartNr}
              onChange={(e) => setChartNr(Number(e.target.value))}
              disabled={sensorRows.length === 0}
            >
              {sensorRows.length === 0 ? (
                <option value={0}>—</option>
              ) : (
                sensorRows.map((s) => {
                  const nr = sensorNr(s)!
                  const name = typeof s.name === 'string' ? s.name : `Sensor ${nr}`
                  return (
                    <option key={nr} value={nr}>
                      {nr} — {name}
                    </option>
                  )
                })
              )}
            </Select>
          </Field>
          <Field label="Window" htmlFor="sensor-chart-window" className={styles.chartFieldSm}>
            <Select id="sensor-chart-window" value={lastHours} onChange={(e) => setLastHours(Number(e.target.value))}>
              <option value={6}>6 h</option>
              <option value={24}>24 h</option>
              <option value={72}>3 d</option>
              <option value={168}>7 d</option>
            </Select>
          </Field>
          <Field label="Max points" htmlFor="sensor-chart-max" className={styles.chartFieldSm}>
            <Select id="sensor-chart-max" value={maxSamples} onChange={(e) => setMaxSamples(Number(e.target.value))}>
              <option value={100}>100</option>
              <option value={300}>300</option>
              <option value={500}>500</option>
            </Select>
          </Field>
        </div>
        {effectiveChartNr === 0 ? null : so.isPending ? (
          <div className={styles.loading}>
            <Spinner />
          </div>
        ) : so.isError ? (
          <ErrorBox message={so.error instanceof Error ? so.error.message : 'Log load failed'} />
        ) : (
          <SensorLogChart entries={so.data?.log ?? []} unit={chartUnit} hour12={hour12} />
        )}
      </Card>

      <SensorEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        mode={editorMode}
        initialRow={editorRow}
        nextNr={nextNr}
        types={sensorTypesList}
      />
    </MoreSubpageLayout>
  )
}
