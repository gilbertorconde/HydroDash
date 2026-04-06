import { useEffect, useState, type ReactNode } from 'react'
import { useController, useChangeOptions } from '../api/hooks'
import {
  WEATHER_PROVIDERS,
  describeWeatherError,
  normalizeWeatherProviderId,
  providerById,
  wtoRecord,
} from '../lib/weatherProviders'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import shell from '../components/MoreSubpageLayout.module.css'
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
          No live weather payload yet. If your firmware is current, try a full page reload; otherwise
          readings may appear only after the controller gets a successful response from the weather service.
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
          <strong>weather service URL</strong> returns a successful response the firmware can use. If checks fail,
          use the error code and last-check times below.
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
    <MoreSubpageLayout title="Weather & forecast">
      <p className={shell.lead}>
        Provider and API keys are saved on the device (form below). Live readings appear only after the
        controller successfully calls your <strong>weather service URL</strong> and receives usable data, not from
        configuration alone.
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
                    ? ' The weather script returned a generic failure (often an upstream provider or internal server issue). Confirm location, API key, and provider on the device, then try again.'
                    : ' The weather script returned this errCode in its response (see label above).'}
              </span>
            ) : null}
          </dd>
          <dt>Weather restricted</dt>
          <dd>{jc.data?.wtrestr != null ? String(jc.data.wtrestr) : '—'}</dd>
          <dt>Live weather payload</dt>
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
          This form only updates provider and API key. Other weather fields stay as stored on the device; tune
          water level and location under Settings.
        </p>
      </Card>
    </MoreSubpageLayout>
  )
}
