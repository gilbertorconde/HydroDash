import { Spinner } from '../ui'
import { describeWeatherError } from '../../lib/weatherProviders'
import styles from './dashboardWidgets.module.css'

type Settings = Record<string, unknown> | undefined

type Props = {
  settings: Settings
  providerLabel: string
  providerId: string
  weatherServiceRunning: string | null
}

/** `wterr` → "None" for 0, known label (with code) when mapped, else "Error <code>". */
function formatWeatherErrorCode(raw: unknown): string {
  if (raw == null || raw === '') return '—'
  const code = Number(raw)
  if (!Number.isFinite(code)) return String(raw)
  if (code === 0) return 'None'
  const label = describeWeatherError(code)
  return label ? `${label} (${code})` : `Error ${code}`
}

/** `"42.36,-71.06"` → lat/lon strings when it is a valid coordinate pair, else null. */
function parseLocationCoords(loc: string): { lat: string; lon: string } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(loc)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat: m[1], lon: m[2] }
}

function LocationValue({ loc }: { loc: unknown }) {
  const text = typeof loc === 'string' ? loc.trim() : loc != null ? String(loc) : ''
  if (!text) return <>—</>
  const coords = parseLocationCoords(text)
  if (!coords) return <>{text}</>
  return (
    <a
      className={styles.inlineLink}
      href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(coords.lat)}&mlon=${encodeURIComponent(coords.lon)}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {coords.lat}, {coords.lon}
    </a>
  )
}

export function SensorsWidget({
  settings,
  providerLabel,
  providerId,
  weatherServiceRunning,
}: Props) {
  if (!settings) return <Spinner />

  return (
    <dl className={styles.dl}>
      <dt>Sensor 1</dt>
      <dd>{settings.sn1 ? 'Active' : 'Inactive'}</dd>
      <dt>Sensor 2</dt>
      <dd>{settings.sn2 ? 'Active' : 'Inactive'}</dd>
      <dt>Weather provider</dt>
      <dd>
        {providerLabel}
        {providerId !== 'Apple' ? (
          <span className={styles.providerId}> ({providerId})</span>
        ) : null}
      </dd>
      <dt>Weather service</dt>
      <dd title="Name reported by the running weather script (wtdata.wp)">
        {weatherServiceRunning ?? '—'}
      </dd>
      <dt>Weather error</dt>
      <dd>{formatWeatherErrorCode(settings.wterr ?? 0)}</dd>
      <dt>Location</dt>
      <dd className={styles.mono}>
        <LocationValue loc={settings.loc} />
      </dd>
    </dl>
  )
}
