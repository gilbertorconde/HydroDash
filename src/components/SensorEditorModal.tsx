import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useSensorSave } from '../api/hooks'
import { Button, ErrorBox } from './ui'
import type { SensorTypeEntry } from '../lib/opensprinklerSensorsApi'
import {
  ipv4StringToOsDec,
  osDecToIpv4String,
  pickSensorBool,
  pickSensorNum,
  pickSensorStr,
} from '../lib/opensprinklerSensorsApi'
import styles from './SensorEditorModal.module.css'

export type SensorFormState = {
  nr: number
  type: number
  name: string
  group: number
  ipStr: string
  port: number
  id: number
  ri: number
  enable: boolean
  log: boolean
  show: boolean
  fac: number
  div: number
  unit: string
  offset: number
  offset2: number
  topic: string
  filter: string
  url: string
}

function defaultForm(nextNr: number, types: SensorTypeEntry[]): SensorFormState {
  const t = types[0]?.type ?? 10
  return {
    nr: nextNr,
    type: t,
    name: `Sensor ${nextNr}`,
    group: 0,
    ipStr: '0.0.0.0',
    port: 0,
    id: 0,
    ri: 60,
    enable: true,
    log: true,
    show: true,
    fac: 1,
    div: 1,
    unit: '',
    offset: 0,
    offset2: 0,
    topic: '',
    filter: '',
    url: '',
  }
}

function formFromRow(r: Record<string, unknown>): SensorFormState {
  const ipn = pickSensorNum(r, 'ip', 0)
  return {
    nr: pickSensorNum(r, 'nr', 1),
    type: pickSensorNum(r, 'type', 10),
    name: pickSensorStr(r, 'name', ''),
    group: pickSensorNum(r, 'group', 0),
    ipStr: osDecToIpv4String(ipn),
    port: pickSensorNum(r, 'port', 0),
    id: pickSensorNum(r, 'id', 0),
    ri: pickSensorNum(r, 'ri', 60),
    enable: pickSensorBool(r, 'enable', true),
    log: pickSensorBool(r, 'log', true),
    show: pickSensorBool(r, 'show', true),
    fac: pickSensorNum(r, 'fac', 1),
    div: pickSensorNum(r, 'div', 1),
    unit: pickSensorStr(r, 'unit', ''),
    offset: pickSensorNum(r, 'offset', 0),
    offset2: pickSensorNum(r, 'offset2', 0),
    topic: pickSensorStr(r, 'topic', ''),
    filter: pickSensorStr(r, 'filter', ''),
    url: pickSensorStr(r, 'url', ''),
  }
}

function buildScParams(f: SensorFormState): Record<string, string | number | undefined> {
  const p: Record<string, string | number | undefined> = {
    nr: f.nr,
    type: f.type,
    name: f.name.trim() || `Sensor ${f.nr}`,
    group: f.group,
    ip: ipv4StringToOsDec(f.ipStr.trim()),
    port: f.port,
    id: f.id,
    ri: f.ri,
    enable: f.enable ? 1 : 0,
    log: f.log ? 1 : 0,
    show: f.show ? 1 : 0,
    fac: f.fac,
    div: f.div,
    offset: f.offset,
    offset2: f.offset2,
  }
  if (f.unit.trim()) p.unit = f.unit.trim()
  if (f.topic.trim()) p.topic = f.topic.trim()
  if (f.filter.trim()) p.filter = f.filter.trim()
  if (f.url.trim()) p.url = f.url.trim()
  return p
}

type Props = {
  open: boolean
  onClose: () => void
  mode: 'new' | 'edit'
  initialRow: Record<string, unknown> | null
  nextNr: number
  types: SensorTypeEntry[]
}

export function SensorEditorModal({ open, onClose, mode, initialRow, nextNr, types }: Props) {
  const save = useSensorSave()
  const [form, setForm] = useState<SensorFormState>(() => defaultForm(nextNr, types))
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (mode === 'edit' && initialRow) setForm(formFromRow(initialRow))
      else setForm(defaultForm(nextNr, types))
    }
    prevOpenRef.current = open
  }, [open, mode, initialRow, nextNr, types])

  if (!open) return null

  function set<K extends keyof SensorFormState>(key: K, v: SensorFormState[K]) {
    setForm((s) => ({ ...s, [key]: v }))
  }

  async function submit() {
    try {
      await save.mutateAsync(buildScParams(form))
      onClose()
    } catch {
      /* ErrorBox */
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sensor-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="sensor-editor-title" className={styles.title}>
            {mode === 'new' ? 'Add sensor' : `Edit sensor ${form.nr}`}
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.hint}>
            Same fields as the controller sensor screen: values are sent as the usual query parameters
            (including reversed packed IP). Adjust for your hardware and sensor type.
          </p>

          {save.isError ? (
            <ErrorBox message={save.error instanceof Error ? save.error.message : 'Save failed'} />
          ) : null}

          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="se-nr">Nr</label>
              <input
                id="se-nr"
                className={styles.input}
                type="number"
                min={1}
                value={form.nr}
                disabled={mode === 'edit'}
                onChange={(e) => set('nr', Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-type">Type</label>
              {types.length > 0 ? (
                <select
                  id="se-type"
                  className={styles.input}
                  value={form.type}
                  onChange={(e) => set('type', parseInt(e.target.value, 10))}
                >
                  {types.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.type} — {t.name} ({t.unit})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="se-type"
                  className={styles.input}
                  type="number"
                  min={0}
                  value={form.type}
                  onChange={(e) => set('type', parseInt(e.target.value, 10) || 0)}
                />
              )}
            </div>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label htmlFor="se-name">Name</label>
              <input
                id="se-name"
                className={styles.input}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-group">Group</label>
              <input
                id="se-group"
                className={styles.input}
                type="number"
                min={0}
                value={form.group}
                onChange={(e) => set('group', parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-ip">IP (network sensors)</label>
              <input
                id="se-ip"
                className={styles.input}
                inputMode="decimal"
                placeholder="0.0.0.0"
                value={form.ipStr}
                onChange={(e) => set('ipStr', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-port">Port</label>
              <input
                id="se-port"
                className={styles.input}
                type="number"
                min={0}
                value={form.port}
                onChange={(e) => set('port', parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-id">Id (ADC / sub-id)</label>
              <input
                id="se-id"
                className={styles.input}
                type="number"
                min={0}
                value={form.id}
                onChange={(e) => set('id', parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-ri">Read interval (s)</label>
              <input
                id="se-ri"
                className={styles.input}
                type="number"
                min={1}
                value={form.ri}
                onChange={(e) => set('ri', Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-fac">Factor (user-defined)</label>
              <input
                id="se-fac"
                className={styles.input}
                type="number"
                step="any"
                value={form.fac}
                onChange={(e) => set('fac', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-div">Divider</label>
              <input
                id="se-div"
                className={styles.input}
                type="number"
                step="any"
                value={form.div}
                onChange={(e) => set('div', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-unit">Unit label</label>
              <input
                id="se-unit"
                className={styles.input}
                value={form.unit}
                onChange={(e) => set('unit', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-off1">Offset</label>
              <input
                id="se-off1"
                className={styles.input}
                type="number"
                step="any"
                value={form.offset}
                onChange={(e) => set('offset', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="se-off2">Offset 2</label>
              <input
                id="se-off2"
                className={styles.input}
                type="number"
                step="any"
                value={form.offset2}
                onChange={(e) => set('offset2', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label htmlFor="se-topic">MQTT topic</label>
              <input
                id="se-topic"
                className={styles.input}
                value={form.topic}
                onChange={(e) => set('topic', e.target.value)}
              />
            </div>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label htmlFor="se-filter">MQTT filter</label>
              <input
                id="se-filter"
                className={styles.input}
                value={form.filter}
                onChange={(e) => set('filter', e.target.value)}
              />
            </div>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <label htmlFor="se-url">URL (reserved)</label>
              <input
                id="se-url"
                className={styles.input}
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
              />
            </div>
          </div>

          <div className={styles.checkRow}>
            <label>
              <input
                type="checkbox"
                checked={form.enable}
                onChange={(e) => set('enable', e.target.checked)}
              />
              Enabled
            </label>
            <label>
              <input type="checkbox" checked={form.log} onChange={(e) => set('log', e.target.checked)} />
              Logging
            </label>
            <label>
              <input type="checkbox" checked={form.show} onChange={(e) => set('show', e.target.checked)} />
              Show on device home
            </label>
          </div>

          <div className={styles.actions}>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="button" disabled={save.isPending} onClick={() => void submit()}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
