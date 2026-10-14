import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CloudRain, CloudSun, Droplets, Gauge, Settings2, Sun, Thermometer, Umbrella, Wind } from 'lucide-react'
import { useChangeOptions, useChangeValues, useController, useJsonAll } from '../api/hooks'
import { ADJUSTMENT_METHODS, WEATHER_RESTRICTION_BIT } from '../lib/opensprinklerOptions'
import {
  WEATHER_PROVIDERS,
  describeWeatherError,
  normalizeWeatherProviderId,
  providerById,
  wtoRecord,
} from '../lib/weatherProviders'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import { useToast } from '../components/toastContext'
import {
  AdvancedSection,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Pill,
  Select,
  Spinner,
} from '../components/ui'
import { formatEpochSecondsLocale } from '../lib/formatLocale'
import { useAppPreferences } from '../lib/appPreferences'
import styles from './ForecastPage.module.css'

function isEmptyWtdata(wt: unknown): boolean {
  if (wt == null) return true
  if (typeof wt !== 'object' || Array.isArray(wt)) return false
  return Object.keys(wt as object).length === 0
}

function renderRawWtdata(wt: unknown): ReactNode {
  if (wt == null) {
    return (
      <>
        <span>—</span>
        <p className={styles.hint}>
          No live weather payload yet. If your firmware is current, try a full page reload; otherwise readings may
          appear only after the controller gets a successful response from the weather service.
        </p>
      </>
    )
  }
  if (isEmptyWtdata(wt)) {
    return (
      <>
        <pre className={styles.pre}>{'{}'}</pre>
        <p className={styles.hint}>
          Choosing a provider only configures how the weather script runs. Readings show up here after your{' '}
          <strong>weather service URL</strong> returns a successful response the firmware can use. If checks fail, use
          the error code and last-check times.
        </p>
      </>
    )
  }
  return <pre className={styles.pre}>{JSON.stringify(wt, null, 2)}</pre>
}

type Reading = { key: string; label: string; value: string; icon: ReactNode }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round = (v: number, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d)

/**
 * Human-readable readings from `/jc wtdata`. The weather service reports imperial units
 * (°F, inches, mph); convert when the app is set to metric. Unknown keys are listed as-is.
 */
function wtdataReadings(wt: unknown, metric: boolean): { provider: string | null; readings: Reading[] } {
  if (!wt || typeof wt !== 'object' || Array.isArray(wt)) return { provider: null, readings: [] }
  const o = wt as Record<string, unknown>
  const temp = (f: number) => (metric ? `${round(((f - 32) * 5) / 9)} °C` : `${round(f)} °F`)
  const len = (inch: number) => (metric ? `${round(inch * 25.4)} mm` : `${round(inch, 2)} in`)
  const speed = (mph: number) => (metric ? `${round(mph * 1.609)} km/h` : `${round(mph)} mph`)
  const iconSize = 15
  const known: Record<string, { label: string; fmt: (n: number) => string; icon: ReactNode }> = {
    t: {
      label: 'Temperature',
      fmt: temp,
      icon: <Thermometer size={iconSize} aria-hidden />,
    },
    maxT: {
      label: 'High',
      fmt: temp,
      icon: <Thermometer size={iconSize} aria-hidden />,
    },
    minT: {
      label: 'Low',
      fmt: temp,
      icon: <Thermometer size={iconSize} aria-hidden />,
    },
    h: {
      label: 'Humidity',
      fmt: (n) => `${round(n, 0)}%`,
      icon: <Droplets size={iconSize} aria-hidden />,
    },
    maxH: {
      label: 'Max humidity',
      fmt: (n) => `${round(n, 0)}%`,
      icon: <Droplets size={iconSize} aria-hidden />,
    },
    minH: {
      label: 'Min humidity',
      fmt: (n) => `${round(n, 0)}%`,
      icon: <Droplets size={iconSize} aria-hidden />,
    },
    p: {
      label: 'Precipitation',
      fmt: len,
      icon: <CloudRain size={iconSize} aria-hidden />,
    },
    raining: {
      label: 'Raining now',
      fmt: (n) => (n ? 'Yes' : 'No'),
      icon: <Umbrella size={iconSize} aria-hidden />,
    },
    wind: {
      label: 'Wind',
      fmt: speed,
      icon: <Wind size={iconSize} aria-hidden />,
    },
    eto: {
      label: 'Evapotranspiration',
      fmt: (n) => `${len(n)}/day`,
      icon: <Sun size={iconSize} aria-hidden />,
    },
    radiation: {
      label: 'Solar radiation',
      fmt: (n) => `${round(n, 2)} kWh/m²`,
      icon: <Sun size={iconSize} aria-hidden />,
    },
    scale: {
      label: 'Suggested level',
      fmt: (n) => `${round(n, 0)}%`,
      icon: <Gauge size={iconSize} aria-hidden />,
    },
  }
  const provider = typeof o.wp === 'string' ? o.wp : typeof o.weatherProvider === 'string' ? o.weatherProvider : null
  const readings: Reading[] = []
  for (const [k, v] of Object.entries(o)) {
    if (k === 'wp' || k === 'weatherProvider') continue
    const spec = known[k]
    const n = num(v)
    if (spec && n != null) {
      readings.push({
        key: k,
        label: spec.label,
        value: spec.fmt(n),
        icon: spec.icon,
      })
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      readings.push({
        key: k,
        label: k,
        value: String(v),
        icon: <Gauge size={iconSize} aria-hidden />,
      })
    }
  }
  const order = Object.keys(known)
  readings.sort((a, b) => {
    const ia = order.indexOf(a.key)
    const ib = order.indexOf(b.key)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  return { provider, readings }
}

/** "3 min ago" style gap between two controller timestamps (both in device time). */
function agoLabel(then: unknown, now: unknown): string | null {
  const t = num(then)
  const n = num(now)
  if (t == null || n == null || t <= 0) return null
  const s = Math.max(0, n - t)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 172800) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

const RAIN_DELAY_PRESETS = [12, 24, 48]

export function ForecastPage() {
  const jc = useController(8000)
  const ja = useJsonAll()
  const co = useChangeOptions()
  const cv = useChangeValues()
  const toast = useToast()
  const prefs = useAppPreferences()

  function formatUnixSec(sec: unknown): string {
    if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return '—'
    return formatEpochSecondsLocale(sec, { hour12: !prefs.is24Hour })
  }

  const [provider, setProvider] = useState<string>('Apple')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    if (!jc.isSuccess) return
    const w = wtoRecord(jc.data?.wto)
    queueMicrotask(() => {
      setProvider(normalizeWeatherProviderId(w.provider))
      setApiKey(typeof w.key === 'string' ? w.key : '')
    })
  }, [jc.isSuccess, jc.data?.wto])

  const sel = providerById(provider)
  const needsKey = sel?.needsKey ?? false

  async function saveProvider() {
    try {
      const prev = wtoRecord(jc.data?.wto)
      const next: Record<string, unknown> = { ...prev, provider }
      if (needsKey) next.key = apiKey
      else delete next.key
      const inner = JSON.stringify(next)
      await co.mutateAsync({
        wto: inner.slice(1, -1),
      } as unknown as Record<string, string | number>)
      toast.success('Weather provider options saved to the controller.')
      void jc.refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function setRainDelay(hours: number) {
    try {
      await cv.mutateAsync({ rd: hours })
      toast.success(hours > 0 ? `Rain delay set for ${hours} hours.` : 'Rain delay cleared.')
      void jc.refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change rain delay')
    }
  }

  const wtdata = jc.data?.wtdata
  const wterr = jc.data?.wterr
  const wterrLabel = describeWeatherError(wterr)
  const loc = jc.data?.loc

  // Summary values: watering level and method come from options (/ja), status from /jc.
  const opts = ja.data?.options
  const wl = typeof opts?.wl === 'number' ? opts.wl : null
  // Low 7 bits select the method; bit 7 is the weather-restriction flag on newer firmware.
  const uwtRaw = typeof opts?.uwt === 'number' ? opts.uwt : null
  const uwt = uwtRaw == null ? null : uwtRaw & 0x7f
  const restrictionEnabled = uwtRaw != null && (uwtRaw & WEATHER_RESTRICTION_BIT) !== 0
  const methodName = uwt == null ? null : (ADJUSTMENT_METHODS.find((m) => m.id === uwt)?.name ?? `Method ${uwt}`)
  const statusOk = wterr === 0
  const hasStatus = typeof wterr === 'number'
  const statusLabel = !hasStatus ? '—' : statusOk ? 'OK' : (wterrLabel ?? `Error ${wterr}`)
  const checkedAgo = agoLabel(jc.data?.lswc, jc.data?.devt)

  const { provider: wtProvider, readings } = wtdataReadings(wtdata, prefs.isMetric)

  const rd = jc.data?.rd === 1
  const rdHoursLeft =
    rd && num(jc.data?.rdst) != null && num(jc.data?.devt) != null
      ? Math.max(0, Math.ceil(((jc.data!.rdst as number) - (jc.data!.devt as number)) / 3600))
      : null

  const wterrExplain =
    hasStatus && wterr !== 0
      ? wterr < 0
        ? 'The controller could not complete the HTTP call to your weather service URL (network, timeout, or empty body).'
        : wterr === 99
          ? 'The weather script returned a generic failure (often an upstream provider or internal server issue). Confirm location, API key, and provider on the device, then try again.'
          : 'The weather script returned this error code in its response (see label above).'
      : null

  return (
    <MoreSubpageLayout
      title="Weather"
      eyebrow={
        hasStatus ? (
          <Pill tone="glass" icon={<span className={statusOk ? styles.dotOk : styles.dotErr} aria-hidden />}>
            {statusOk ? 'Weather service OK' : `Weather error · ${statusLabel}`}
          </Pill>
        ) : null
      }
      heroContent={
        <div className={styles.heroLevel}>
          <div className={styles.heroLevelMain}>
            <span className={styles.heroLevelValue}>{wl != null ? wl : '—'}</span>
            {wl != null ? <span className={styles.heroLevelPct}>%</span> : null}
          </div>
          <div className={styles.heroLevelText}>
            <span className={styles.heroLevelLabel}>Watering level</span>
            <span className={styles.heroLevelSub}>
              {methodName ? `${methodName} adjustment` : 'Adjustment —'}
              {checkedAgo ? ` · checked ${checkedAgo}` : ''}
            </span>
          </div>
          <Link to="/settings" className={styles.heroLink}>
            <Settings2 size={16} aria-hidden />
            Adjust
          </Link>
        </div>
      }
    >
      <div className={styles.grid}>
        <div className={styles.col}>
          <Card
            title="Current conditions"
            subtitle={loc ? String(loc) : undefined}
            icon={<CloudSun size={18} aria-hidden />}
            titleAction={wtProvider ? <Pill>{wtProvider}</Pill> : undefined}
          >
            {jc.isLoading && !jc.data ? <Spinner /> : null}
            {readings.length > 0 ? (
              <div className={styles.readings}>
                {readings.map((r) => (
                  <div key={r.key} className={styles.reading}>
                    <span className={styles.readingLabel}>
                      {r.icon}
                      {r.label}
                    </span>
                    <span className={styles.readingValue}>{r.value}</span>
                  </div>
                ))}
              </div>
            ) : jc.data ? (
              <EmptyState
                icon={<CloudSun size={22} aria-hidden />}
                title="No weather readings yet"
                description={
                  uwt === 0
                    ? 'Manual adjustment doesn’t use weather data. Pick an automatic method in Settings to see live readings here.'
                    : 'Readings appear after the controller gets a successful response from its weather service.'
                }
              />
            ) : null}
          </Card>

          <Card title="Rain delay" icon={<Umbrella size={18} aria-hidden />}>
            <p className={styles.rdStatus}>
              {rd ? (
                <>
                  <Pill tone="warning">Active</Pill>
                  {rdHoursLeft != null ? `Watering resumes in about ${rdHoursLeft} h.` : 'Watering is paused.'}
                </>
              ) : (
                <>
                  <Pill tone="success">Off</Pill>
                  Programs run as scheduled.
                </>
              )}
            </p>
            <div className={styles.rdActions}>
              {RAIN_DELAY_PRESETS.map((h) => (
                <Button
                  key={h}
                  variant="secondary"
                  size="sm"
                  disabled={cv.isPending}
                  onClick={() => void setRainDelay(h)}
                >
                  {h} h
                </Button>
              ))}
              {rd ? (
                <Button variant="ghost" size="sm" disabled={cv.isPending} onClick={() => void setRainDelay(0)}>
                  Clear delay
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
        <div className={styles.col}>
          <Card title="Adjustment" icon={<Gauge size={18} aria-hidden />}>
            <dl className={styles.dl}>
              <div>
                <dt>Method</dt>
                <dd>{methodName ?? '—'}</dd>
              </div>
              <div>
                <dt>Watering level</dt>
                <dd>{wl != null ? `${wl}%` : '—'}</dd>
              </div>
              <div>
                <dt>Last check</dt>
                <dd>{formatUnixSec(jc.data?.lwc)}</dd>
              </div>
              <div>
                <dt>Last successful check</dt>
                <dd>{formatUnixSec(jc.data?.lswc)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{hasStatus ? <Pill tone={statusOk ? 'success' : 'danger'}>{statusLabel}</Pill> : '—'}</dd>
              </div>
            </dl>
            {wterrExplain ? <p className={styles.errNote}>{wterrExplain}</p> : null}
            <p className={styles.hint}>Method and level are changed under Settings → Watering &amp; weather.</p>
          </Card>

          <Card title="Weather provider" icon={<CloudRain size={18} aria-hidden />}>
            {jc.isLoading && !jc.data ? <Spinner /> : null}
            <Field label="Provider" htmlFor="wx-prov">
              <Select id="wx-prov" value={provider} onChange={(e) => setProvider(e.target.value)}>
                {WEATHER_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            {needsKey ? (
              <Field label="API key / token" htmlFor="wx-key">
                <Input id="wx-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
              </Field>
            ) : (
              <p className={styles.hint}>This provider does not require an API key on the device.</p>
            )}
            <Button disabled={co.isPending} onClick={() => void saveProvider()} className={styles.saveBtn}>
              {co.isPending ? 'Saving…' : 'Save provider'}
            </Button>
            <p className={styles.hint}>
              Only provider and API key are changed here; other weather options stay as stored on the device.
            </p>
          </Card>
        </div>
      </div>

      <AdvancedSection
        id="weather.details"
        title="Technical details"
        description="Weather service URL, error codes, restrictions and the raw payload"
      >
        <dl className={styles.dl}>
          <div>
            <dt>Weather service URL</dt>
            <dd className={styles.mono}>
              {jc.data?.wsp != null && String(jc.data.wsp).trim() !== '' ? String(jc.data.wsp) : '—'}
            </dd>
          </div>
          <div>
            <dt>Location string</dt>
            <dd className={styles.mono}>{loc != null ? String(loc) : '—'}</dd>
          </div>
          <div>
            <dt>Weather error code</dt>
            <dd>
              {wterr != null ? String(wterr) : '—'}
              {wterrLabel ? <span className={styles.errLabel}> — {wterrLabel}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Weather restricted</dt>
            <dd>
              {jc.data?.wtrestr != null ? String(jc.data.wtrestr) : '—'}
              <span className={styles.muted}>
                {' '}
                ({jc.data?.wtrestr ? 'watering currently blocked by a weather restriction' : 'not restricting now'})
              </span>
            </dd>
          </div>
          <div>
            <dt>Restriction flag (uwt bit 7)</dt>
            <dd>{uwtRaw == null ? '—' : restrictionEnabled ? 'On' : 'Off'}</dd>
          </div>
        </dl>
        <div>
          <p className={styles.techLabel}>Live weather payload (wtdata)</p>
          {renderRawWtdata(wtdata)}
        </div>
      </AdvancedSection>
    </MoreSubpageLayout>
  )
}
