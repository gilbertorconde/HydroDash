import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  Radio,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
} from 'lucide-react'
import { Card, Spinner, StatTile } from '../ui'
import { formatMinutesWall } from '../../lib/formatLocale'
import { formatDeviceDateTime } from './dashboardShared'
import styles from './dashboardWidgets.module.css'

type Props = {
  /** `/jc` (controller state); undefined while loading. */
  jc: Record<string, unknown> | undefined
  /** `/ja` options block (`wl`, `sn1t`, `sn2t`). */
  options: Record<string, unknown> | undefined
  isMetric: boolean
  is24Hour: boolean
  className?: string
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** Firmware sensor types (`sn1t` / `sn2t`). 0 = none. */
const SENSOR_TYPES: Record<number, { name: string; on: string; off: string }> = {
  1: { name: 'Rain sensor', on: 'Rain', off: 'Dry' },
  2: { name: 'Flow sensor', on: 'Active', off: 'Idle' },
  3: { name: 'Soil sensor', on: 'Wet', off: 'Dry' },
  240: { name: 'Program switch', on: 'Pressed', off: 'Idle' },
}

type Tile = {
  key: string
  label: string
  value: ReactNode
  icon: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  hint?: ReactNode
}

/**
 * Weather readings from `wtdata` (when the weather script reports them; Zimmerman/ETo report
 * imperial units), watering level, rain delay, rain/soil sensors and sunrise/sunset.
 */
export function ConditionsCard({ jc, options, isMetric, is24Hour, className }: Props) {
  const tiles: Tile[] = []
  if (jc) {
    const wt =
      jc.wtdata && typeof jc.wtdata === 'object' && !Array.isArray(jc.wtdata)
        ? (jc.wtdata as Record<string, unknown>)
        : {}
    const tF = num(wt.t)
    if (tF != null) {
      tiles.push({
        key: 't',
        label: 'Temperature',
        value: isMetric ? `${Math.round(((tF - 32) * 5) / 9)}°C` : `${Math.round(tF)}°F`,
        icon: <Thermometer size={13} aria-hidden />,
        tone: 'warning',
      })
    }
    const h = num(wt.h)
    if (h != null) {
      tiles.push({ key: 'h', label: 'Humidity', value: `${Math.round(h)}%`, icon: <Droplets size={13} aria-hidden /> })
    }
    const pIn = num(wt.p)
    if (pIn != null) {
      tiles.push({
        key: 'p',
        label: 'Rain',
        value: isMetric ? `${(pIn * 25.4).toFixed(pIn > 0 ? 1 : 0)} mm` : `${pIn.toFixed(2)} in`,
        icon: <CloudRain size={13} aria-hidden />,
        tone: num(wt.raining) ? 'accent' : 'neutral',
        hint: num(wt.raining) ? 'Raining now' : undefined,
      })
    }
    const eto = num(wt.eto)
    if (eto != null) {
      tiles.push({
        key: 'eto',
        label: 'ETo',
        value: isMetric ? `${(eto * 25.4).toFixed(1)} mm` : `${eto.toFixed(2)} in`,
        icon: <CloudSun size={13} aria-hidden />,
      })
    }

    const wl = num(options?.wl)
    if (wl != null) {
      tiles.push({
        key: 'wl',
        label: 'Watering level',
        value: `${wl}%`,
        icon: <Gauge size={13} aria-hidden />,
        tone: wl === 0 ? 'danger' : 'success',
        hint: num(jc.wtrestr) ? 'Restricted by weather' : undefined,
      })
    }

    const rdOn = Boolean(jc.rd)
    const rdst = num(jc.rdst)
    tiles.push({
      key: 'rd',
      label: 'Rain delay',
      value: rdOn ? 'On' : 'Off',
      icon: <Umbrella size={13} aria-hidden />,
      tone: rdOn ? 'accent' : 'neutral',
      hint:
        rdOn && rdst
          ? `Until ${formatDeviceDateTime(rdst, num(jc.devt) ?? undefined, is24Hour)}`
          : undefined,
    })

    let anySensor = false
    for (const n of [1, 2] as const) {
      const type = num(options?.[`sn${n}t`]) ?? 0
      const meta = SENSOR_TYPES[type]
      if (!meta) continue
      anySensor = true
      const active = Boolean(jc[`sn${n}`])
      tiles.push({
        key: `sn${n}`,
        label: `Sensor ${n}`,
        value: active ? meta.on : meta.off,
        icon: <Radio size={13} aria-hidden />,
        tone: active ? 'warning' : 'neutral',
        hint: meta.name,
      })
    }
    if (!anySensor) {
      tiles.push({
        key: 'sn',
        label: 'Sensors',
        value: 'None',
        icon: <Radio size={13} aria-hidden />,
        hint: `S1 ${jc.sn1 ? 'active' : 'inactive'} · S2 ${jc.sn2 ? 'active' : 'inactive'}`,
      })
    }

    const sunrise = num(jc.sunrise)
    const sunset = num(jc.sunset)
    if (sunrise != null && sunset != null) {
      tiles.push({
        key: 'sun',
        label: 'Sunrise',
        value: formatMinutesWall(sunrise, is24Hour),
        icon: <Sunrise size={13} aria-hidden />,
        tone: 'warning',
        hint: (
          <span className={styles.inlineIcon}>
            <Sunset size={12} aria-hidden /> {formatMinutesWall(sunset, is24Hour)}
          </span>
        ),
      })
    }
  }

  return (
    <Card
      className={className}
      title="Conditions"
      icon={<CloudSun size={18} aria-hidden />}
      titleAction={<Link to="/forecast">Weather</Link>}
    >
      {!jc ? (
        <Spinner />
      ) : (
        <div className={styles.tiles}>
          {tiles.map((t) => (
            <StatTile key={t.key} label={t.label} value={t.value} icon={t.icon} tone={t.tone} hint={t.hint} />
          ))}
        </div>
      )}
    </Card>
  )
}
