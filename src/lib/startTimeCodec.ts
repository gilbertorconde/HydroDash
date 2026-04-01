/**
 * Start-time encoding per OpenSprinkler API 2.2.1:
 * — Fixed: bit15 disabled; bits13–14 sun; bit12 sign; bits0–10 offset minutes; else 0–1439 clock.
 * — Repeating: start0 same as first time; start1 count; start2 interval (minutes); start3 unused.
 */

export const START_DISABLED = -1

export function isStartDisabled(value: number): boolean {
  if (value < 0) return true
  if ((value & 0x8000) !== 0) return true
  return false
}

export type DecodedStart =
  | { kind: 'disabled' }
  | { kind: 'clock'; minutes: number }
  | { kind: 'sunrise'; offsetMin: number }
  | { kind: 'sunset'; offsetMin: number }

export function decodeStartToken(value: number): DecodedStart {
  if (isStartDisabled(value)) return { kind: 'disabled' }
  const u = value & 0xffff
  const b13 = (u >> 13) & 1
  const b14 = (u >> 14) & 1
  if (b13 === 0 && b14 === 0) {
    return { kind: 'clock', minutes: Math.max(0, Math.min(1439, u)) }
  }
  const sign = (u >> 12) & 1 ? -1 : 1
  const mag = u & 0x7ff
  const offsetMin = sign * mag
  if (b14) return { kind: 'sunrise', offsetMin }
  if (b13) return { kind: 'sunset', offsetMin }
  return { kind: 'clock', minutes: Math.max(0, Math.min(1439, u)) }
}

export function encodeClockMinutes(minutes: number): number {
  return Math.max(0, Math.min(1439, Math.floor(minutes)))
}

export function encodeSunriseOffset(offsetMin: number): number {
  const mag = Math.min(0x7ff, Math.abs(Math.floor(offsetMin)))
  const signBit = offsetMin < 0 ? 1 << 12 : 0
  return (1 << 14) | signBit | mag
}

export function encodeSunsetOffset(offsetMin: number): number {
  const mag = Math.min(0x7ff, Math.abs(Math.floor(offsetMin)))
  const signBit = offsetMin < 0 ? 1 << 12 : 0
  return (1 << 13) | signBit | mag
}

export function encodeStartFromDecoded(d: DecodedStart): number {
  if (d.kind === 'disabled') return START_DISABLED
  if (d.kind === 'clock') return encodeClockMinutes(d.minutes)
  if (d.kind === 'sunrise') return encodeSunriseOffset(d.offsetMin)
  return encodeSunsetOffset(d.offsetMin)
}

function pad2(v: number): string {
  return String(v).padStart(2, '0')
}

export function formatStartTokenLabel(value: number): string {
  const d = decodeStartToken(value)
  if (d.kind === 'disabled') return '—'
  if (d.kind === 'clock') {
    const hh = Math.floor(d.minutes / 60)
    const mm = d.minutes % 60
    return `${pad2(hh)}:${pad2(mm)}`
  }
  if (d.kind === 'sunrise') {
    if (d.offsetMin === 0) return 'Sunrise'
    return d.offsetMin > 0 ? `Sunrise +${d.offsetMin}m` : `Sunrise ${d.offsetMin}m`
  }
  if (d.offsetMin === 0) return 'Sunset'
  return d.offsetMin > 0 ? `Sunset +${d.offsetMin}m` : `Sunset ${d.offsetMin}m`
}

export function clockMinutesToTimeString(minutes: number): string {
  if (minutes < 0 || minutes > 1439) return ''
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`
}

export function timeStringToClockMinutes(value: string): number | null {
  if (!value.trim()) return null
  const [h, m] = value.split(':').map((v) => parseInt(v, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const t = h * 60 + m
  if (t < 0 || t > 1439) return null
  return t
}
