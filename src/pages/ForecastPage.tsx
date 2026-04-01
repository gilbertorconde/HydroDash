import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useController, useChangeOptions } from '../api/hooks'
import {
  WEATHER_PROVIDERS,
  describeWeatherError,
  normalizeWeatherProviderId,
  providerById,
  wtoRecord,
} from '../lib/weatherProviders'
import { Card, Button, Input, Label, ErrorBox, Spinner } from '../components/ui'
import { formatEpochSecondsLocale } from '../lib/formatLocale'
import { useAppPreferences } from '../lib/appPreferences'
import styles from './ForecastPage.module.css'

function isEmptyWtdata(wt: unknown): boolean {
  if (wt == null) return true
  if (typeof wt !== 'object' || Array.isArray(wt)) return false
  return Object.keys(wt as object).length === 0
}

function renderWtdata(wt: unknown): ReactNode {
  if (wt == null) {
    return (
      <>
        <span>—</span>
        <p className={styles.hint}>
          No <code>wtdata</code> on this <code>/jc</code> response. If your firmware is current, try a full page reload;
          otherwise the field may be omitted until the first weather response.
        </p>
      </>
    )
  }
  if (isEmptyWtdata(wt)) {
    return (
      <>
        <pre className={styles.pre}>{'{}'}</pre>
        <p className={styles.hint}>
          A weather <strong>provider</strong> in <code>wto</code> only selects how the script behaves. Actual readings
          appear here only after your <strong>weather service URL</strong> returns a successful response that includes{' '}
          <code>rawData</code> (JSON) for the firmware to embed. If checks fail, see <strong>Weather error code</strong>{' '}
          and last-check times below.
        </p>
      </>
    )
  }
  return <pre className={styles.pre}>{JSON.stringify(wt, null, 2)}</pre>
}

export function ForecastPage() {
  const jc = useController(8000)
  const co = useChangeOptions()
  const prefs = useAppPreferences()

  function formatUnixSec(sec: unknown): string {
    if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return '—'
    return formatEpochSecondsLocale(sec, { hour12: !prefs.is24Hour })
  }

  const [provider, setProvider] = useState<string>('Apple')
  const [apiKey, setApiKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // `wto` lives on `/jc` (controller), not on `/jo` (options) — same as OpenSprinkler-App `controller.settings.wto`.
  const wtoSnapshot = useMemo(() => {
    const raw = jc.data?.wto
    if (raw == null) return ''
    if (typeof raw === 'string') return raw
    try {
      return JSON.stringify(raw)
    } catch {
      return ''
    }
  }, [jc.data?.wto])

  useEffect(() => {
    if (!jc.isSuccess) return
    const w = wtoRecord(jc.data?.wto)
    setProvider(normalizeWeatherProviderId(w.provider))
    setApiKey(typeof w.key === 'string' ? w.key : '')
  }, [jc.isSuccess, wtoSnapshot])

  const sel = providerById(provider)
  const needsKey = sel?.needsKey ?? false

  async function saveProvider() {
    setErr(null)
    setMsg(null)
    try {
      const prev = wtoRecord(jc.data?.wto)
      const next: Record<string, unknown> = { ...prev, provider }
      if (needsKey) next.key = apiKey
      else delete next.key
      const inner = JSON.stringify(next)
      await co.mutateAsync({
        wto: inner.slice(1, -1),
      } as unknown as Record<string, string | number>)
      setMsg('Weather provider options saved to the controller.')
      void jc.refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const wtdata = jc.data?.wtdata
  const wterr = jc.data?.wterr
  const wterrLabel = describeWeatherError(wterr)
  const loc = jc.data?.loc

  return (
    <div>
      <h1 className={styles.title}>Weather & forecast</h1>
      <p className={styles.lead}>
        Provider and keys live in <code>wto</code> (below). Live readings in <code>wtdata</code> are filled only when the
        controller successfully calls your <strong>weather service URL</strong> and the script returns{' '}
        <code>rawData</code> — not from configuration alone.
      </p>
      {err ? <ErrorBox message={err} /> : null}
      {msg ? <p className={styles.ok}>{msg}</p> : null}

      <Card title="Live controller data">
        {jc.isLoading && !jc.data ? <Spinner /> : null}
        <dl className={styles.dl}>
          <dt>Weather service URL</dt>
          <dd className={styles.mono}>
            {jc.data?.wsp != null && String(jc.data.wsp).trim() !== ''
              ? String(jc.data.wsp)
              : '—'}
          </dd>
          <dt>Location string</dt>
          <dd className={styles.mono}>{loc != null ? String(loc) : '—'}</dd>
          <dt>Last weather check</dt>
          <dd>{formatUnixSec(jc.data?.lwc)}</dd>
          <dt>Last successful check</dt>
          <dd>{formatUnixSec(jc.data?.lswc)}</dd>
          <dt>Weather error code</dt>
          <dd>
            {wterr != null ? String(wterr) : '—'}
            {wterrLabel ? <span className={styles.errLabel}> — {wterrLabel}</span> : null}
            {typeof wterr === 'number' && wterr !== 0 ? (
              <span className={styles.hintInline}>
                {wterr < 0
                  ? ' The controller could not complete the HTTP call to your weather service URL (network, timeout, or empty body).'
                  : wterr === 99
                    ? ' The weather script returned a generic failure (often an upstream provider or internal server issue). Confirm location, API key, and provider in OG “Verify”; check OpenSprinkler forums if it persists.'
                    : ' The weather script returned this errCode in its response (see label above).'}
              </span>
            ) : null}
          </dd>
          <dt>Weather restricted</dt>
          <dd>{jc.data?.wtrestr != null ? String(jc.data.wtrestr) : '—'}</dd>
          <dt>wtdata</dt>
          <dd>{renderWtdata(wtdata)}</dd>
        </dl>
      </Card>

      <Card title="Weather provider">
        {jc.isLoading && !jc.data ? <Spinner /> : null}
        <div className={styles.field}>
          <Label htmlFor="wx-prov">Provider</Label>
          <select
            id="wx-prov"
            className={styles.select}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {WEATHER_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {needsKey ? (
          <div className={styles.field}>
            <Label htmlFor="wx-key">API key / token</Label>
            <Input
              id="wx-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>
        ) : (
          <p className={styles.hint}>This provider does not require an API key on the device.</p>
        )}
        <Button disabled={co.isPending} onClick={() => void saveProvider()}>
          Save provider to controller
        </Button>
        <p className={styles.hint}>
          Advanced fields stay in the JSON blob; this form updates <code>provider</code> and{' '}
          <code>key</code> only. Tune water level and location under Settings.
        </p>
      </Card>
    </div>
  )
}
