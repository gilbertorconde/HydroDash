import { useMemo, useState } from 'react'
import {
  useSensorDelete,
  useSensorGet,
  useSensorList,
  useSensorLog,
  useSensorReadNow,
  useSensorTypes,
} from '../api/hooks'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import shell from '../components/MoreSubpageLayout.module.css'
import { SensorEditorModal } from '../components/SensorEditorModal'
import { Button, Card, ErrorBox, Spinner } from '../components/ui'
import { formatEpochSecondsLocale } from '../lib/formatLocale'
import type { SensorDataEntry, SensorLogEntry } from '../lib/opensprinklerSensorsApi'
import { sensorNumericData } from '../lib/opensprinklerSensorsApi'
import styles from './AnalogSensorsPage.module.css'

function sensorNr(s: Record<string, unknown>): number | null {
  const n = s.nr
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function formatLastRead(epoch: number | undefined): string {
  if (epoch == null || !Number.isFinite(epoch) || epoch <= 0) return '—'
  return formatEpochSecondsLocale(epoch)
}

function SensorLogChart({ entries, unit }: { entries: SensorLogEntry[]; unit: string }) {
  const points = useMemo(() => {
    const list = (entries ?? [])
      .map((e) => ({ t: e.time, v: sensorNumericData(e.data) }))
      .filter((p): p is { t: number; v: number } => p.v != null && Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t)
    return list
  }, [entries])

  if (points.length < 2) {
    return <p className={styles.chartEmpty}>Not enough logged samples in this window.</p>
  }

  const t0 = points[0]!.t
  const t1 = points[points.length - 1]!.t
  const vals = points.map((p) => p.v)
  let vMin = Math.min(...vals)
  let vMax = Math.max(...vals)
  if (vMin === vMax) {
    vMin -= 1
    vMax += 1
  }
  const pad = (vMax - vMin) * 0.08 || 0.5
  vMin -= pad
  vMax += pad

  const W = 640
  const H = 160
  const margin = { l: 8, r: 8, t: 8, b: 20 }
  const iw = W - margin.l - margin.r
  const ih = H - margin.t - margin.b

  const xScale = (t: number) => margin.l + ((t - t0) / (t1 - t0 || 1)) * iw
  const yScale = (v: number) => margin.t + (1 - (v - vMin) / (vMax - vMin || 1)) * ih

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t).toFixed(1)} ${yScale(p.v).toFixed(1)}`)
    .join(' ')

  const startLabel = formatEpochSecondsLocale(t0)
  const endLabel = formatEpochSecondsLocale(t1)

  return (
    <svg
      className={styles.chartSvg}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-label="Sensor log chart"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--color-accent, var(--color-cta))"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <text x={margin.l} y={H - 4} fontSize="10" fill="var(--color-muted)">
        {startLabel}
      </text>
      <text x={W - margin.r} y={H - 4} fontSize="10" fill="var(--color-muted)" textAnchor="end">
        {endLabel}
        {unit ? ` · ${unit}` : ''}
      </text>
    </svg>
  )
}

export function AnalogSensorsPage() {
  const sl = useSensorList()
  const apiOk = sl.data?.kind === 'ok'
  const listPayload = sl.data?.kind === 'ok' ? sl.data.data : undefined
  const sensors = listPayload?.sensors ?? []
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
    so.data?.log?.find((e) => e.nr === effectiveChartNr)?.unit ??
    valueByNr.get(effectiveChartNr)?.unit ??
    ''

  if (sl.isPending) {
    return (
      <MoreSubpageLayout title="Sensors">
        <Spinner />
      </MoreSubpageLayout>
    )
  }

  if (sl.data?.kind === 'unsupported') {
    return (
      <MoreSubpageLayout title="Sensors">
        <p className={shell.lead}>
          Extended analog and logged sensors use an optional controller API. This device did not return a
          sensor list, so either the firmware build has no sensor stack or the request failed.
        </p>
        <Card title="Unavailable">
          <p className={styles.unsupported}>
            HydroDash only talks to the controller over the same JSON API as the mobile app. If your
            hardware uses the sensor extension, update to a firmware that exposes sensor list and log
            commands, then open this page again.
          </p>
          <p className={styles.unsupportedDetail}>{sl.data.message}</p>
        </Card>
      </MoreSubpageLayout>
    )
  }

  const warnings = listPayload?.warnings
  const count = listPayload?.count ?? sensorRows.length

  return (
    <MoreSubpageLayout title="Sensors">
      <p className={shell.lead}>
        Same sensor list, live values, log chart, read-now, and definition editor as the controller UI on
        firmware that implements the extended sensor API.
      </p>

      {warnings && warnings.length > 0 ? (
        <div className={styles.warnings} role="status">
          <strong>Warnings from controller</strong>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <Button variant="cta" type="button" onClick={() => {
          setEditorMode('new')
          setEditorRow(null)
          setEditorOpen(true)
        }}>
          Add sensor
        </Button>
        <Button
          variant="secondary"
          disabled={readNow.isPending}
          onClick={() => readNow.mutate(0)}
        >
          {readNow.isPending ? 'Reading…' : 'Read all now'}
        </Button>
        <span className={styles.mono}>
          {count} sensor{count === 1 ? '' : 's'}
          {listPayload?.detected != null ? ` · boards ${listPayload.detected}` : ''}
        </span>
      </div>

      {sg.isError ? <ErrorBox message={sg.error instanceof Error ? sg.error.message : 'Load failed'} /> : null}
      {sf.isError ? (
        <ErrorBox message="Could not load sensor type list; you can still enter a numeric type when adding a sensor." />
      ) : null}
      {delSensor.isError ? (
        <ErrorBox message={delSensor.error instanceof Error ? delSensor.error.message : 'Delete failed'} />
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nr</th>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
              <th>Unit</th>
              <th>Last read</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sensorRows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <span className={styles.mono}>No sensors configured.</span>
                </td>
              </tr>
            ) : (
              sensorRows.map((s) => {
                const nr = sensorNr(s)!
                const name = typeof s.name === 'string' ? s.name : '—'
                const type = typeof s.type === 'number' ? s.type : '—'
                const row = valueByNr.get(nr)
                const val = sensorNumericData(row?.data)
                const unit = row?.unit ?? '—'
                const last = row?.last
                return (
                  <tr key={nr}>
                    <td className={styles.mono}>{nr}</td>
                    <td>{name}</td>
                    <td className={styles.mono}>{type}</td>
                    <td className={styles.mono}>{val != null ? String(val) : '—'}</td>
                    <td>{typeof unit === 'string' ? unit : '—'}</td>
                    <td>{formatLastRead(last)}</td>
                    <td>
                      <span className={styles.rowActions}>
                        <Button
                          variant="ghost"
                          disabled={readNow.isPending}
                          onClick={() => readNow.mutate(nr)}
                        >
                          Read
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => {
                            setEditorMode('edit')
                            setEditorRow(s)
                            setEditorOpen(true)
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          disabled={delSensor.isPending}
                          onClick={() => {
                            if (!window.confirm(`Remove sensor ${nr}?`)) return
                            delSensor.mutate(nr)
                          }}
                        >
                          Remove
                        </Button>
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Card title="Log chart" className={styles.chartCard}>
        <div className={styles.chartControls}>
          <label>
            Sensor{' '}
            <select
              className={styles.select}
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
            </select>
          </label>
          <label>
            Window{' '}
            <select
              className={styles.select}
              value={lastHours}
              onChange={(e) => setLastHours(Number(e.target.value))}
            >
              <option value={6}>6 h</option>
              <option value={24}>24 h</option>
              <option value={72}>3 d</option>
              <option value={168}>7 d</option>
            </select>
          </label>
          <label>
            Max points{' '}
            <select
              className={styles.select}
              value={maxSamples}
              onChange={(e) => setMaxSamples(Number(e.target.value))}
            >
              <option value={100}>100</option>
              <option value={300}>300</option>
              <option value={500}>500</option>
            </select>
          </label>
        </div>
        {so.isPending ? (
          <Spinner />
        ) : so.isError ? (
          <ErrorBox message={so.error instanceof Error ? so.error.message : 'Log load failed'} />
        ) : (
          <SensorLogChart entries={so.data?.log ?? []} unit={chartUnit} />
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
