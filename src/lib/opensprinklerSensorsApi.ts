/**
 * Extended OpenSprinkler sensor API (analog / logging firmware).
 * Matches the JSON shapes emitted by firmware that implements /sl, /sg, /so, /sr.
 * Stock firmware without this stack will fail these requests; the UI treats that as unsupported.
 */

export type SensorListPayload = {
  count?: number
  detected?: number
  warnings?: string[]
  sensors?: Record<string, unknown>[]
}

export type SensorDataEntry = {
  nr: number
  nativedata?: number
  data?: number | string
  unit?: string
  unitid?: number
  last?: number
  status?: number
}

export type SensorGetPayload = {
  datas?: SensorDataEntry[]
}

export type SensorLogEntry = {
  nr: number
  type: number
  time: number
  nativedata?: number
  data?: number | string
  unit?: string
  unitid?: number
}

export type SensorLogPayload = {
  logtype: number
  logsize: number
  filesize: number
  log?: SensorLogEntry[]
}

export function sensorNumericData(data: number | string | undefined): number | null {
  if (data === undefined || data === null) return null
  const n = typeof data === 'number' ? data : Number(String(data).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** `/sf` payload: supported sensor kinds for the dropdown (extended firmware). */
export type SensorTypeEntry = {
  type: number
  name: string
  unit: string
  unitid: number
}

export type SensorTypesPayload = {
  count?: number
  detected?: number
  sensorTypes?: SensorTypeEntry[]
}

/**
 * Firmware packs IPv4 as a uint32 with reversed octet order vs typical network byte order
 * (documented in vendor Sensor API examples).
 */
export function ipv4StringToOsDec(s: string): number {
  const p = s
    .trim()
    .split('.')
    .map((x) => parseInt(x, 10))
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return 0
  const [a, b, c, d] = p as [number, number, number, number]
  return ((d << 24) | (c << 16) | (b << 8) | a) >>> 0
}

export function osDecToIpv4String(n: number): string {
  const u = n >>> 0
  return `${u & 255}.${(u >>> 8) & 255}.${(u >>> 16) & 255}.${(u >>> 24) & 255}`
}

export function pickSensorNum(r: Record<string, unknown>, key: string, fallback: number): number {
  const v = r[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function pickSensorStr(r: Record<string, unknown>, key: string, fallback: string): string {
  const v = r[key]
  return typeof v === 'string' ? v : fallback
}

export function pickSensorBool(r: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = r[key]
  if (v === true) return true
  if (v === false) return false
  if (typeof v === 'number' && Number.isFinite(v)) return v !== 0
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true'
  return fallback
}
