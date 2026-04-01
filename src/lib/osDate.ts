/** OpenSprinkler date encoding: `(month << 5) + day` (see API date-range tuple). */

export function encodeOsDate(month: number, day: number): number {
  const m = Math.max(1, Math.min(12, Math.floor(month)))
  const d = Math.max(1, Math.min(31, Math.floor(day)))
  return (m << 5) + d
}

export function decodeOsDate(code: number): { month: number; day: number } {
  const m = (code >> 5) & 0xf
  const d = code & 31
  return { month: m || 1, day: d || 1 }
}

export function formatOsDateMmDd(code: number): string {
  const { month, day } = decodeOsDate(code)
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}

/** Parse MM/DD or M/D into OS date code; returns null if invalid. */
export function parseMmDdToOsDate(s: string): number | null {
  const t = s.trim()
  const m = t.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/)
  if (!m) return null
  const month = parseInt(m[1], 10)
  const day = parseInt(m[2], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return encodeOsDate(month, day)
}

/** Epoch-day (UTC, same as OpenSprinkler-App dates.js) → yyyy-mm-dd for input[type=date]. */
export function epochDaysToIsoDate(epochDay: number): string {
  const d = new Date(epochDay * 86400 * 1000)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

export function isoDateToEpochDays(iso: string): number | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return Math.floor(Date.UTC(y, month - 1, day) / (86400 * 1000))
}

/** Pack 16-bit epoch day into days0 (high) and days1 (low) for single-run programs. */
export function packEpochDay16(epochDay: number): [number, number] {
  const u = ((epochDay & 0xffff) + 0x10000) % 0x10000
  return [(u >> 8) & 0xff, u & 0xff]
}

export function unpackEpochDay16(days0: number, days1: number): number {
  return ((days0 & 0xff) << 8) | (days1 & 0xff)
}
