import { useEffect, useState } from 'react'
import { Activity, X } from 'lucide-react'
import { useSensorSave } from '../api/hooks'
import { AdvancedSection, Button, ErrorBox, Field, Input, Select, Switch } from './ui'
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
  // Reset the form each time the dialog opens (state adjusted during render, not in an effect).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setForm(mode === 'edit' && initialRow ? formFromRow(initialRow) : defaultForm(nextNr, types))
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

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

  const intField = (
    key: 'nr' | 'group' | 'port' | 'id' | 'ri',
    id: string,
    label: string,
    opts: { min?: number; floor?: number; disabled?: boolean } = {},
  ) => (
    <Field label={label} htmlFor={id} className={styles.field}>
      <Input
        id={id}
        type="number"
        min={opts.min ?? 0}
        value={form[key]}
        disabled={opts.disabled}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          set(key, opts.floor != null ? Math.max(opts.floor, n || opts.floor) : n || 0)
        }}
      />
    </Field>
  )

  const floatField = (key: 'fac' | 'div' | 'offset' | 'offset2', id: string, label: string) => (
    <Field label={label} htmlFor={id} className={styles.field}>
      <Input
        id={id}
        type="number"
        step="any"
        value={form[key]}
        onChange={(e) => set(key, parseFloat(e.target.value) || 0)}
      />
    </Field>
  )

  const textField = (key: 'topic' | 'filter' | 'url', id: string, label: string) => (
    <Field label={label} htmlFor={id} className={`${styles.field} ${styles.fieldWide}`}>
      <Input id={id} value={form[key]} onChange={(e) => set(key, e.target.value)} />
    </Field>
  )

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
          <span className={styles.headerIcon}>
            <Activity size={18} aria-hidden />
          </span>
          <div className={styles.headerText}>
            <h2 id="sensor-editor-title" className={styles.title}>
              {mode === 'new' ? 'Add sensor' : `Edit sensor ${form.nr}`}
            </h2>
            <p className={styles.subtitle}>Values are sent to the controller as-is; match them to your hardware.</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className={styles.body}>
          {save.isError ? (
            <ErrorBox message={save.error instanceof Error ? save.error.message : 'Save failed'} />
          ) : null}

          <Field label="Name" htmlFor="se-name">
            <Input id="se-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className={styles.gridTwo}>
            <Field label="Type" htmlFor="se-type" className={styles.field}>
              {types.length > 0 ? (
                <Select id="se-type" value={form.type} onChange={(e) => set('type', parseInt(e.target.value, 10))}>
                  {types.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.type} — {t.name} ({t.unit})
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="se-type"
                  type="number"
                  min={0}
                  value={form.type}
                  onChange={(e) => set('type', parseInt(e.target.value, 10) || 0)}
                />
              )}
            </Field>
            <Field label="Unit label" htmlFor="se-unit" className={styles.field} hint="Leave empty to use the type’s unit">
              <Input id="se-unit" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
            </Field>
          </div>
          <Switch
            checked={form.enable}
            onChange={(v) => set('enable', v)}
            label="Enabled"
            description="Read this sensor on its interval"
          />

          <AdvancedSection
            id="sensors.editor"
            title="Advanced"
            description="Number, wiring/network address, scaling, MQTT and logging"
          >
            <div className={styles.grid}>
              {intField('nr', 'se-nr', 'Nr', { min: 1, floor: 1, disabled: mode === 'edit' })}
              {intField('group', 'se-group', 'Group')}
              <Field label="IP (network sensors)" htmlFor="se-ip" className={styles.field}>
                <Input
                  id="se-ip"
                  inputMode="decimal"
                  placeholder="0.0.0.0"
                  value={form.ipStr}
                  onChange={(e) => set('ipStr', e.target.value)}
                />
              </Field>
              {intField('port', 'se-port', 'Port')}
              {intField('id', 'se-id', 'Id (ADC / sub-id)')}
              {intField('ri', 'se-ri', 'Read interval (s)', { min: 1, floor: 1 })}
              {floatField('fac', 'se-fac', 'Factor (user-defined)')}
              {floatField('div', 'se-div', 'Divider')}
              {floatField('offset', 'se-off1', 'Offset')}
              {floatField('offset2', 'se-off2', 'Offset 2')}
              {textField('topic', 'se-topic', 'MQTT topic')}
              {textField('filter', 'se-filter', 'MQTT filter')}
              {textField('url', 'se-url', 'URL (reserved)')}
            </div>
            <div>
              <Switch
                checked={form.log}
                onChange={(v) => set('log', v)}
                label="Logging"
                description="Keep a history of readings on the controller"
              />
              <Switch
                checked={form.show}
                onChange={(v) => set('show', v)}
                label="Show on device home"
                description="Display on the controller’s own home screen"
              />
            </div>
          </AdvancedSection>
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
  )
}
