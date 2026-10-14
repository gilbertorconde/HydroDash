import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Cpu, ExternalLink } from 'lucide-react'
import { Card, Pill, Spinner } from '../ui'
import { formatUnifiedFirmwareVersion } from '../../lib/opensprinklerFirmwareRelease'
import { describeWeatherError } from '../../lib/weatherProviders'
import { formatDurationShort } from '../../lib/irrigationLog'
import { formatDeviceDateTime } from './dashboardShared'
import styles from './dashboardWidgets.module.css'

type FirmwareUpdateHint = {
  /** e.g. 2.2.1(4), from defines.h when available */
  versionLabel: string
  releaseUrl: string
}

type Props = {
  className?: string
  loading: boolean
  connected: boolean
  jc: Record<string, unknown> | undefined
  fwv: unknown
  fwm: unknown
  /** When set, controller firmware is older than the latest GitHub unified release (informational only). */
  firmwareUpdate?: FirmwareUpdateHint | null
  /** When true, GitHub check succeeded and firmware matches or exceeds the latest published release. */
  firmwareUpToDate?: boolean
  programCount: number | undefined
  stationCount: number | undefined
  stationNames: string[]
  providerLabel: string
  providerId: string
  weatherServiceRunning: string | null
  is24Hour: boolean
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

/** Coordinates → OSM pin; a place name → OSM search. */
function LocationValue({ loc }: { loc: unknown }) {
  const text = typeof loc === 'string' ? loc.trim() : loc != null ? String(loc) : ''
  if (!text) return <>—</>
  const coords = parseLocationCoords(text)
  const href = coords
    ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(coords.lat)}&mlon=${encodeURIComponent(coords.lon)}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(text)}`
  return (
    <a className={styles.extLink} href={href} target="_blank" rel="noopener noreferrer">
      {coords ? `${coords.lat}, ${coords.lon}` : text}
      <ExternalLink size={12} aria-hidden />
    </a>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.kvRow}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function ControllerCard(props: Props) {
  const { jc, fwv, fwm, firmwareUpdate, firmwareUpToDate, is24Hour } = props
  const devt = typeof jc?.devt === 'number' ? jc.devt : undefined
  const lrun = Array.isArray(jc?.lrun) ? (jc.lrun as number[]) : null
  const lastRun =
    lrun && (lrun[3] ?? 0) > 0
      ? {
          name: props.stationNames[lrun[0]]?.trim() || `Zone ${lrun[0] + 1}`,
          dur: lrun[2] ?? 0,
          end: lrun[3],
        }
      : null
  const fw =
    typeof fwv === 'number' && typeof fwm === 'number'
      ? formatUnifiedFirmwareVersion(fwv, fwm)
      : fwv != null
        ? `${fwv}${fwm != null ? `.${fwm}` : ''}`
        : '—'

  return (
    <Card
      className={props.className}
      title="Controller"
      icon={<Cpu size={18} aria-hidden />}
      titleAction={<Link to="/settings">Settings</Link>}
    >
      {props.loading ? (
        <Spinner />
      ) : (
        <dl className={styles.kv}>
          <Row label="Status">
            {props.connected ? (
              <Pill tone="success">Connected</Pill>
            ) : (
              <Pill tone="danger">Offline</Pill>
            )}{' '}
            {jc ? (
              jc.en ? (
                <Pill tone="neutral">Enabled</Pill>
              ) : (
                <Pill tone="warning">Disabled</Pill>
              )
            ) : null}
          </Row>
          <Row label="Firmware">
            <span className={styles.mono}>{fw}</span>
            {firmwareUpdate ? (
              <a
                className={styles.extLink}
                href={firmwareUpdate.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Update {firmwareUpdate.versionLabel}
                <ExternalLink size={12} aria-hidden />
              </a>
            ) : firmwareUpToDate ? (
              <span className={styles.okText}>Up to date</span>
            ) : null}
          </Row>
          <Row label="Device time">{devt ? formatDeviceDateTime(devt, undefined, is24Hour) : '—'}</Row>
          <Row label="Location">
            <LocationValue loc={jc?.loc} />
          </Row>
          <Row label="Weather">
            {props.providerLabel}
            {props.providerId !== 'Apple' && props.providerId !== props.providerLabel ? (
              <span className={styles.muted}> ({props.providerId})</span>
            ) : null}
            {props.weatherServiceRunning ? (
              <span className={styles.muted} title="Name reported by the running weather script (wtdata.wp)">
                {' '}
                · {props.weatherServiceRunning}
              </span>
            ) : null}
          </Row>
          <Row label="Weather error">
            <span className={Number(jc?.wterr ?? 0) ? styles.errText : undefined}>
              {formatWeatherErrorCode(jc?.wterr ?? 0)}
            </span>
          </Row>
          {lastRun ? (
            <Row label="Last run">
              {lastRun.name} · {formatDurationShort(lastRun.dur)} ·{' '}
              {formatDeviceDateTime(lastRun.end, devt, is24Hour)}
            </Row>
          ) : null}
          <Row label="Programs · Zones">
            {props.programCount ?? '—'} · {props.stationCount ?? '—'}
          </Row>
        </dl>
      )}
    </Card>
  )
}
