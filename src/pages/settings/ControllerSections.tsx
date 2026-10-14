import { useMemo } from 'react'
import { Field, Input, Select, Switch } from '../../components/ui'
import { useAppPreferences } from '../../lib/appPreferences'
import { FieldGrid, SettingsForm, SubHeading } from './SettingsForm'
import { intOf, num, stationLabel, useDraft, type OptionPayload, type SectionCtx } from './settingsShared'
import styles from './settings.module.css'

/** Build a payload from the dirty keys of a draft whose keys are firmware option names. */
function dirtyOptions<T extends Record<string, number | boolean>>(
  values: T,
  dirtyKeys: (keyof T & string)[],
): OptionPayload {
  const p: OptionPayload = {}
  for (const k of dirtyKeys) {
    const v = values[k]
    p[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v
  }
  return p
}

/** Pick the option keys the firmware reports, as numbers. */
function numericBase(opts: Record<string, unknown>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of keys) if (opts[k] !== undefined) out[k] = num(opts[k])
  return out
}

function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
  min = 0,
  max,
  disabled,
  suffix,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  hint?: string
  min?: number
  max?: number
  disabled?: boolean
  suffix?: string
}) {
  const input = (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(intOf(e.target.value))}
    />
  )
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      {suffix ? (
        <div className={styles.inputSuffix}>
          {input}
          <span aria-hidden>{suffix}</span>
        </div>
      ) : (
        input
      )}
    </Field>
  )
}

/* ---------- Master valves ---------- */

export function MastersSection({ ctx }: { ctx: SectionCtx }) {
  const { opts, data } = ctx
  const prefs = useAppPreferences()
  const snames = data.stations?.snames ?? []
  const base = useMemo(() => numericBase(opts, ['mas', 'mton', 'mtof', 'mas2', 'mton2', 'mtof2']), [opts])
  const d = useDraft(base)
  const v = d.values

  async function save() {
    if (await ctx.apply(dirtyOptions(v, d.dirtyKeys))) d.discard()
  }

  const masterSelect = (key: 'mas' | 'mas2', label: string) => (
    <Field label={label} htmlFor={`set-${key}`}>
      <Select id={`set-${key}`} value={v[key] ?? 0} onChange={(e) => d.set(key, Number(e.target.value))}>
        <option value={0}>None</option>
        {snames.map((_, i) => (
          <option key={i} value={i + 1}>
            {stationLabel(snames, i, prefs.showStationNum)}
          </option>
        ))}
      </Select>
    </Field>
  )

  return (
    <SettingsForm dirty={d.dirty} saving={ctx.saving} onSave={save} onDiscard={d.discard}>
      <SubHeading hint="Opens together with any zone that uses it (pump or main valve).">Master 1</SubHeading>
      {masterSelect('mas', 'Master station')}
      <FieldGrid>
        {opts.mton !== undefined ? (
          <NumberField
            id="set-mton"
            label="On adjustment"
            suffix="sec"
            value={v.mton ?? 0}
            disabled={!v.mas}
            onChange={(n) => d.set('mton', n)}
          />
        ) : null}
        {opts.mtof !== undefined ? (
          <NumberField
            id="set-mtof"
            label="Off adjustment"
            suffix="sec"
            value={v.mtof ?? 0}
            disabled={!v.mas}
            onChange={(n) => d.set('mtof', n)}
          />
        ) : null}
      </FieldGrid>
      {opts.mas2 !== undefined ? (
        <>
          <SubHeading>Master 2</SubHeading>
          {masterSelect('mas2', 'Master station')}
          <FieldGrid>
            {opts.mton2 !== undefined ? (
              <NumberField
                id="set-mton2"
                label="On adjustment"
                suffix="sec"
                value={v.mton2 ?? 0}
                disabled={!v.mas2}
                onChange={(n) => d.set('mton2', n)}
              />
            ) : null}
            {opts.mtof2 !== undefined ? (
              <NumberField
                id="set-mtof2"
                label="Off adjustment"
                suffix="sec"
                value={v.mtof2 ?? 0}
                disabled={!v.mas2}
                onChange={(n) => d.set('mtof2', n)}
              />
            ) : null}
          </FieldGrid>
        </>
      ) : null}
    </SettingsForm>
  )
}

/* ---------- Stations & timing ---------- */

export function StationsSection({ ctx }: { ctx: SectionCtx }) {
  const { opts } = ctx
  const mexp = typeof opts.mexp === 'number' ? opts.mexp : 5
  const dexp = typeof opts.dexp === 'number' ? opts.dexp : -1
  const base = useMemo(
    () => ({
      ...numericBase(opts, ['ext', 'sdt']),
      ...(opts.seq !== undefined ? { seq: opts.seq === 1 } : {}),
    }),
    [opts],
  )
  const d = useDraft(base as Record<string, number | boolean>)
  const v = d.values

  async function save() {
    if (await ctx.apply(dirtyOptions(v, d.dirtyKeys))) d.discard()
  }

  return (
    <SettingsForm dirty={d.dirty} saving={ctx.saving} onSave={save} onDiscard={d.discard}>
      {opts.ext !== undefined ? (
        <Field
          label="Number of stations"
          htmlFor="set-ext"
          hint={
            dexp >= 0 && dexp < 255
              ? `${dexp * 8 + 8} detected on this hardware. Lowering the count hides the extra zones.`
              : 'Lowering the count hides the extra zones.'
          }
        >
          <Select id="set-ext" value={Number(v.ext ?? 0)} onChange={(e) => d.set('ext', Number(e.target.value))}>
            {Array.from({ length: mexp + 1 }, (_, i) => (
              <option key={i} value={i}>
                {i * 8 + 8} stations
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {opts.sdt !== undefined ? (
        <NumberField
          id="set-sdt"
          label="Delay between zones"
          suffix="sec"
          hint="Pause between one zone finishing and the next starting."
          value={Number(v.sdt ?? 0)}
          onChange={(n) => d.set('sdt', n)}
        />
      ) : null}
      {opts.seq !== undefined ? (
        <Switch
          checked={Boolean(v.seq)}
          onChange={(c) => d.set('seq', c)}
          label="Sequential"
          description="Run one zone at a time (off = zones may run in parallel)."
        />
      ) : null}
    </SettingsForm>
  )
}

/* ---------- Sensors wiring ---------- */

const LITERS_PER_GALLON = 3.78541

function encodeFlowPulseRate(litersPerPulse: number): { fpr0: number; fpr1: number } {
  const v = Math.max(0, Math.min(0xffff, Math.round(litersPerPulse * 100)))
  return { fpr0: v & 0xff, fpr1: (v >> 8) & 0xff }
}

export function SensorsSection({ ctx }: { ctx: SectionCtx }) {
  const { opts } = ctx
  const prefs = useAppPreferences()
  const fwv = num(opts.fwv)
  const supportsSoil = fwv >= 219
  const supportsProgSwitch = fwv >= 217
  const hasFlowPulse = opts.fpr0 !== undefined && opts.fpr1 !== undefined
  // Very old firmware: `urs` is a plain on/off rain sensor flag.
  const legacyRainOnly = opts.urs !== undefined && !hasFlowPulse
  const hasUrsMulti = opts.urs !== undefined && hasFlowPulse
  const hasSn1Multi = opts.sn1t !== undefined && hasFlowPulse && !hasUrsMulti

  const base = useMemo(
    () => ({
      ...numericBase(opts, ['urs', 'sn1t', 'sn2t', 'sn1on', 'sn1of', 'sn2on', 'sn2of']),
      ...(opts.rso !== undefined ? { rso: opts.rso === 1 } : {}),
      ...(opts.sn1o !== undefined ? { sn1o: opts.sn1o === 1 } : {}),
      ...(opts.sn2o !== undefined ? { sn2o: opts.sn2o === 1 } : {}),
      // Firmware stores litres per pulse × 100 split over two bytes.
      flowRate: hasFlowPulse ? (num(opts.fpr1) * 256 + num(opts.fpr0)) / 100 : 1,
    }),
    [opts, hasFlowPulse],
  )
  const d = useDraft(base as Record<string, number | boolean>)
  const v = d.values
  const n = (k: string) => Number(v[k] ?? 0)

  const urs = n('urs')
  const sn1t = n('sn1t')
  const sn2t = n('sn2t')
  const primaryType = hasUrsMulti ? urs : hasSn1Multi ? sn1t : 0
  const showRso =
    opts.rso !== undefined &&
    (legacyRainOnly ? urs === 1 : primaryType === 1 || primaryType === 240)
  const showSn1o = opts.sn1o !== undefined && [1, 3, 240].includes(primaryType)
  const showSn2o = opts.sn2o !== undefined && [1, 3, 240].includes(sn2t)
  const showSn1Delay = opts.sn1on !== undefined && (primaryType === 1 || primaryType === 3)
  const showSn2Delay = opts.sn2on !== undefined && (sn2t === 1 || sn2t === 3)
  const showFlow = hasFlowPulse && primaryType === 2
  const showProgSwitchNote = supportsProgSwitch && (primaryType === 240 || sn2t === 240)

  async function save() {
    const p: OptionPayload = {}
    for (const k of d.dirtyKeys) {
      if (k === 'flowRate') Object.assign(p, encodeFlowPulseRate(Number(v.flowRate)))
      else p[k] = typeof v[k] === 'boolean' ? (v[k] ? 1 : 0) : (v[k] as number)
    }
    if (await ctx.apply(p)) d.discard()
  }

  const typeOptions = (prog: 1 | 2, withFlow: boolean) => (
    <>
      <option value={0}>None</option>
      <option value={1}>Rain</option>
      {withFlow ? <option value={2}>Flow</option> : null}
      {supportsSoil ? <option value={3}>Soil</option> : null}
      {supportsProgSwitch ? <option value={240}>Program switch (prog {prog})</option> : null}
    </>
  )

  const delayFields = (s: 1 | 2) => (
    <FieldGrid>
      <NumberField
        id={`set-sn${s}on`}
        label={`Sensor ${s} delayed on`}
        suffix="min"
        value={n(`sn${s}on`)}
        onChange={(x) => d.set(`sn${s}on`, x)}
      />
      <NumberField
        id={`set-sn${s}of`}
        label={`Sensor ${s} delayed off`}
        suffix="min"
        value={n(`sn${s}of`)}
        onChange={(x) => d.set(`sn${s}of`, x)}
      />
    </FieldGrid>
  )

  return (
    <SettingsForm dirty={d.dirty} saving={ctx.saving} onSave={save} onDiscard={d.discard}>
      {legacyRainOnly ? (
        <Switch checked={urs === 1} onChange={(c) => d.set('urs', c ? 1 : 0)} label="Use rain sensor" />
      ) : null}
      {hasUrsMulti || hasSn1Multi ? (
        <>
          <SubHeading>{hasUrsMulti ? 'Sensor (legacy port)' : 'Sensor 1'}</SubHeading>
          <Field label="Type" htmlFor="set-sn1-type">
            <Select
              id="set-sn1-type"
              value={primaryType}
              onChange={(e) => d.set(hasUrsMulti ? 'urs' : 'sn1t', Number(e.target.value))}
            >
              {typeOptions(1, true)}
            </Select>
          </Field>
        </>
      ) : null}
      {showRso ? (
        <Switch
          checked={Boolean(v.rso)}
          onChange={(c) => d.set('rso', c)}
          label="Rain sensor normally open"
          description="Off = normally closed."
        />
      ) : null}
      {showSn1o ? (
        <Switch
          checked={Boolean(v.sn1o)}
          onChange={(c) => d.set('sn1o', c)}
          label="Sensor 1 normally open"
          description="Off = normally closed."
        />
      ) : null}
      {showFlow ? (
        <Field
          label={`Flow pulse rate (${prefs.isMetric ? 'L' : 'gal'} per pulse)`}
          htmlFor="set-flow"
          hint="Units follow the metric setting in App preferences."
        >
          <Input
            id="set-flow"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={prefs.isMetric ? Number(v.flowRate) : Number(v.flowRate) / LITERS_PER_GALLON}
            onChange={(e) => {
              const x = parseFloat(e.target.value) || 0
              d.set('flowRate', prefs.isMetric ? x : x * LITERS_PER_GALLON)
            }}
          />
        </Field>
      ) : null}
      {showSn1Delay ? delayFields(1) : null}

      {opts.sn2t !== undefined ? (
        <>
          <SubHeading>Sensor 2</SubHeading>
          <Field label="Type" htmlFor="set-sn2-type">
            <Select id="set-sn2-type" value={sn2t} onChange={(e) => d.set('sn2t', Number(e.target.value))}>
              {typeOptions(2, false)}
            </Select>
          </Field>
        </>
      ) : null}
      {showSn2o ? (
        <Switch
          checked={Boolean(v.sn2o)}
          onChange={(c) => d.set('sn2o', c)}
          label="Sensor 2 normally open"
          description="Off = normally closed."
        />
      ) : null}
      {showSn2Delay ? delayFields(2) : null}

      {showProgSwitchNote ? (
        <p className={styles.note}>
          Program switch: hold the switch for about a second to start the linked program (see the OpenSprinkler
          docs for wiring).
        </p>
      ) : null}
    </SettingsForm>
  )
}

/* ---------- LCD screen ---------- */

export function LcdSection({ ctx }: { ctx: SectionCtx }) {
  const { opts } = ctx
  const base = useMemo(() => numericBase(opts, ['con', 'lit', 'dim']), [opts])
  const d = useDraft(base)
  const v = d.values

  async function save() {
    if (await ctx.apply(dirtyOptions(v, d.dirtyKeys))) d.discard()
  }

  const fields: { key: string; label: string }[] = [
    { key: 'con', label: 'Contrast' },
    { key: 'lit', label: 'Brightness' },
    { key: 'dim', label: 'Idle brightness' },
  ]

  return (
    <SettingsForm dirty={d.dirty} saving={ctx.saving} onSave={save} onDiscard={d.discard}>
      {fields
        .filter((f) => opts[f.key] !== undefined)
        .map((f) => (
          <NumberField
            key={f.key}
            id={`set-${f.key}`}
            label={f.label}
            hint="0–255"
            max={255}
            value={v[f.key] ?? 0}
            onChange={(x) => d.set(f.key, Math.max(0, Math.min(255, x)))}
          />
        ))}
    </SettingsForm>
  )
}

/* ---------- Power & hardware ---------- */

export function PowerSection({ ctx }: { ctx: SectionCtx }) {
  const { opts } = ctx
  const base = useMemo(() => numericBase(opts, ['bst', 'imin', 'imax', 'tpdv', 'laton', 'latof']), [opts])
  const d = useDraft(base)
  const v = d.values

  async function save() {
    if (await ctx.apply(dirtyOptions(v, d.dirtyKeys))) d.discard()
  }

  const fields: { key: string; label: string; suffix?: string; hint?: string }[] = [
    { key: 'bst', label: 'Boost time', hint: 'DC / latching controllers: how long the boost converter charges.' },
    { key: 'imin', label: 'Undercurrent threshold', suffix: 'mA' },
    { key: 'imax', label: 'Overcurrent limit', suffix: 'mA' },
    { key: 'tpdv', label: 'Target PD voltage' },
    { key: 'laton', label: 'Latch on voltage' },
    { key: 'latof', label: 'Latch off voltage' },
  ]

  return (
    <SettingsForm
      dirty={d.dirty}
      saving={ctx.saving}
      onSave={save}
      onDiscard={d.discard}
      footerNote="Wrong values can damage valves"
    >
      <FieldGrid>
        {fields
          .filter((f) => opts[f.key] !== undefined)
          .map((f) => (
            <NumberField
              key={f.key}
              id={`set-${f.key}`}
              label={f.label}
              suffix={f.suffix}
              hint={f.hint}
              value={v[f.key] ?? 0}
              onChange={(x) => d.set(f.key, x)}
            />
          ))}
      </FieldGrid>
    </SettingsForm>
  )
}

/* ---------- Logging ---------- */

export function LoggingSection({ ctx }: { ctx: SectionCtx }) {
  const { opts } = ctx
  const base = useMemo(() => ({ lg: opts.lg === 1 }), [opts.lg])
  const d = useDraft(base)

  async function save() {
    if (await ctx.apply({ lg: d.values.lg ? 1 : 0 })) d.discard()
  }

  return (
    <SettingsForm dirty={d.dirty} saving={ctx.saving} onSave={save} onDiscard={d.discard}>
      <Switch
        checked={d.values.lg}
        onChange={(c) => d.set('lg', c)}
        label="Enable logging"
        description="Record every zone run on the controller. History needs this on."
      />
    </SettingsForm>
  )
}
