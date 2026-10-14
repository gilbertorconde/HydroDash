import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { CloudSun, Laptop, Moon, Sun } from 'lucide-react'
import { AdvancedSection, Card, Field, Input, Segmented, Select, Switch } from '../../components/ui'
import { useController } from '../../api/hooks'
import { useTheme } from '../../context/ThemeContext'
import { saveAppPreference, useAppPreferences } from '../../lib/appPreferences'
import { formatEpochSecondsLocale } from '../../lib/formatLocale'
import {
  ADJUSTMENT_METHODS,
  TIMEZONE_LABELS,
  timezoneLabelFromTz,
  tzValueFromTimezoneLabel,
  WEATHER_RESTRICTION_BIT,
} from '../../lib/opensprinklerOptions'
import { SettingsForm } from './SettingsForm'
import { num, useDraft, type OptionPayload, type SectionCtx } from './settingsShared'
import styles from './settings.module.css'

/** "-04:00" → "UTC−04:00" (firmware stores an offset only, so there is no city to show). */
function formatUtcOffsetLabel(label: string): string {
  if (/^[+-]00:00$/.test(label)) return 'UTC±00:00'
  return `UTC${label.replace('-', '−')}`
}

/* ---------- Location & time ---------- */

export function LocationSection({ ctx }: { ctx: SectionCtx }) {
  const { opts, st } = ctx
  const prefs = useAppPreferences()
  const jc = useController(15_000)

  const base = useMemo(
    () => ({
      tz: timezoneLabelFromTz(opts.tz) ?? '+00:00',
      loc: String(st.loc ?? '').replace(/^''$/, ''),
    }),
    [opts.tz, st.loc],
  )
  const d = useDraft(base)

  const timezoneOptions = useMemo(() => {
    const set = new Set<string>([...TIMEZONE_LABELS])
    set.add(base.tz)
    set.add(d.values.tz)
    return [...set]
  }, [base.tz, d.values.tz])

  const devt = typeof st.devt === 'number' ? st.devt : jc.data?.devt
  const deviceTime =
    devt == null || devt <= 0 ? '—' : formatEpochSecondsLocale(devt, { hour12: !prefs.is24Hour })

  async function save() {
    const p: OptionPayload = {}
    if (d.isDirty('tz') && opts.tz !== undefined) p.tz = tzValueFromTimezoneLabel(d.values.tz)
    // The firmware splits on spaces, so they travel as underscores.
    if (d.isDirty('loc')) p.loc = d.values.loc.replace(/\s/g, '_')
    if (Object.keys(p).length && (await ctx.apply(p))) d.discard()
  }

  return (
    <SettingsForm dirty={d.dirty} saving={ctx.saving} onSave={save} onDiscard={d.discard}>
      <div className={styles.readout}>
        <span className={styles.readoutLabel}>Controller time</span>
        <span className={styles.readoutValue}>{deviceTime}</span>
        {opts.ntp === 1 ? (
          <span className={styles.readoutHint}>
            Synced over NTP. To set it by hand, turn NTP sync off under Network.
          </span>
        ) : null}
      </div>
      {opts.tz !== undefined ? (
        <Field label="Timezone" htmlFor="set-tz" hint="The controller stores a UTC offset, not a city.">
          <Select id="set-tz" value={d.values.tz} onChange={(e) => d.set('tz', e.target.value)}>
            {timezoneOptions.map((t) => (
              <option key={t} value={t}>
                {formatUtcOffsetLabel(t)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field
        label="Location"
        htmlFor="set-loc"
        hint="Used for weather and sunrise/sunset. Spaces are sent as underscores."
      >
        <Input
          id="set-loc"
          value={d.values.loc}
          onChange={(e) => d.set('loc', e.target.value)}
          placeholder="City, ZIP, or lat,lon"
        />
      </Field>
    </SettingsForm>
  )
}

/* ---------- Watering & weather ---------- */

export function WateringSection({ ctx }: { ctx: SectionCtx }) {
  const { opts } = ctx
  const fwv = num(opts.fwv)
  const rawUwt = num(opts.uwt)
  // Bit 7 of `uwt` is the weather-restriction flag (managed on the Weather page); the method is
  // the low 7 bits. Keep the flag untouched when the method changes.
  const restrictBit = rawUwt & WEATHER_RESTRICTION_BIT

  const base = useMemo(
    () => ({ method: rawUwt & ~WEATHER_RESTRICTION_BIT, wl: String(opts.wl ?? '') }),
    [rawUwt, opts.wl],
  )
  const d = useDraft(base)

  const choices = useMemo(() => {
    const list = ADJUSTMENT_METHODS.filter((m) => !m.minFw || fwv >= m.minFw)
    if (!list.some((m) => m.id === base.method)) list.push({ id: base.method, name: `Method ${base.method}` })
    return list
  }, [fwv, base.method])

  const hasUwt = opts.uwt !== undefined
  // The percentage is computed by the controller unless the method is Manual.
  const wlLocked = hasUwt && d.values.method > 0

  async function save() {
    const p: OptionPayload = {}
    if (hasUwt && d.isDirty('method')) p.uwt = d.values.method | restrictBit
    if (!wlLocked && d.isDirty('wl')) p.wl = Math.max(0, Math.min(250, parseInt(d.values.wl, 10) || 0))
    if (Object.keys(p).length && (await ctx.apply(p))) d.discard()
  }

  return (
    <>
      <SettingsForm dirty={d.dirty} saving={ctx.saving} onSave={save} onDiscard={d.discard}>
        {hasUwt ? (
          <Field
            label="Adjustment method"
            htmlFor="set-uwt"
            hint={
              restrictBit
                ? 'Weather restrictions are on and stay on when you change the method (edit them on the Weather page).'
                : 'How the controller scales watering times from the weather.'
            }
          >
            <Select id="set-uwt" value={d.values.method} onChange={(e) => d.set('method', Number(e.target.value))}>
              {choices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          label="Watering level"
          htmlFor="set-wl"
          hint={
            wlLocked
              ? 'Set automatically by the selected adjustment method. Choose Manual to set it yourself.'
              : '0–250%. 100% runs programs exactly as written.'
          }
        >
          <div className={styles.inputSuffix}>
            <Input
              id="set-wl"
              type="number"
              inputMode="numeric"
              min={0}
              max={250}
              value={d.values.wl}
              onChange={(e) => d.set('wl', e.target.value)}
              disabled={wlLocked}
            />
            <span aria-hidden>%</span>
          </div>
        </Field>
      </SettingsForm>
      <Link to="/forecast" className={styles.linkCard}>
        <span className={styles.linkCardIcon}>
          <CloudSun size={18} aria-hidden />
        </span>
        <span className={styles.linkCardText}>
          <strong>Weather provider &amp; API key</strong>
          <span>Live conditions, provider and restrictions on the Weather page</span>
        </span>
      </Link>
    </>
  )
}

/* ---------- App preferences (this browser only) ---------- */

export function AppPrefsSection() {
  const prefs = useAppPreferences()
  const theme = useTheme()

  return (
    <>
      <Card>
        <div className={styles.formBody}>
          <p className={styles.note}>Saved instantly on this device only — these don't change the controller.</p>
          <Field label="Theme">
            <Segmented
              label="Theme"
              value={theme.mode}
              onChange={theme.setMode}
              options={[
                {
                  value: 'system',
                  label: (
                    <span className={styles.segLabel}>
                      <Laptop size={15} aria-hidden /> System
                    </span>
                  ),
                },
                {
                  value: 'light',
                  label: (
                    <span className={styles.segLabel}>
                      <Sun size={15} aria-hidden /> Light
                    </span>
                  ),
                },
                {
                  value: 'dark',
                  label: (
                    <span className={styles.segLabel}>
                      <Moon size={15} aria-hidden /> Dark
                    </span>
                  ),
                },
              ]}
            />
          </Field>
          <div className={styles.switchList}>
            <Switch
              checked={prefs.isMetric}
              onChange={(v) => saveAppPreference('isMetric', v)}
              label="Use metric units"
              description="Litres instead of gallons for flow sensors."
            />
            <Switch
              checked={prefs.is24Hour}
              onChange={(v) => saveAppPreference('is24Hour', v)}
              label="Use 24-hour time"
            />
            <Switch
              checked={prefs.sortByStationName}
              onChange={(v) => saveAppPreference('sortByStationName', v)}
              label="Order zones by name"
            />
            <Switch
              checked={prefs.showAdvanced}
              onChange={(v) => saveAppPreference('showAdvanced', v)}
              label="Show advanced options"
              description="Open the purple Advanced sections by default across the app."
            />
          </div>
        </div>
      </Card>
      <AdvancedSection id="settings.app.zoneList" title="Zone list display" description="Grouping, disabled zones, numbers">
        <div className={styles.switchList}>
          <Switch
            checked={prefs.groupView}
            onChange={(v) => saveAppPreference('groupView', v)}
            label="Order zones by sequential group"
          />
          <Switch
            checked={prefs.showDisabled}
            onChange={(v) => saveAppPreference('showDisabled', v)}
            label="Show disabled zones"
          />
          <Switch
            checked={prefs.showStationNum}
            onChange={(v) => saveAppPreference('showStationNum', v)}
            label="Show zone numbers"
          />
        </div>
      </AdvancedSection>
    </>
  )
}
