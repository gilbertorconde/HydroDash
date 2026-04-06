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
