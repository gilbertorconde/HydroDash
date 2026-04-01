import type { JsonAll } from '../api/types'

export type ParsedLogEvent = {
  pid: number
  stationKind: 'zone' | 'special'
  /** Set for zone rows; remapped index for special string tokens when applicable */
  stationIndex: number | null
  stationLabel: string
  durationSec: number
  startSec: number
  endSec: number
  flowRate?: number
  /** Count toward OG-style “station events” / runtime totals */
  includeInStats: boolean
  raw: unknown[]
}

/** `/jl` is usually a JSON array; some paths may wrap rows in an object. */
export function normalizeJlPayload(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    for (const key of ['ld', 'data', 'logs', 'jl', 'entries', 'rows']) {
      const v = o[key]
      if (Array.isArray(v)) return v
    }
  }
  return []
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function durationFromRow(row: unknown[]): number {
  const raw = asFiniteNumber(row[2])
  if (raw === null) return 0
  let d = Math.floor(raw)
  if (d < 0) d += 65536
  return d
}

function mapSpecialToken(token: string): string {
  const t = token.toLowerCase()
  if (t === 'rs') return 'Rain sensor'
  if (t === 'rd') return 'Rain delay'
  if (t === 's1') return 'Sensor 1'
  if (t === 's2') return 'Sensor 2'
  return token
}

/**
 * Resolve string station tokens to the same indices the OG app uses for grouping
 * (see OpenSprinkler-App `logs.js`).
 */
export function resolveSpecialStationIndex(snamesLength: number, token: string): number | null {
  const t = token.toLowerCase()
  const n = snamesLength
  if (n < 3) return null
  if (t === 'rd') return n - 1
  if (t === 's1') return n - 3
  if (t === 's2' || t === 'rs') return n - 2
  return null
}

/** Mirrors OG `$.merge(snames, additionalMetrics)` length for `station > stations.length - 2`. */
function ogMergedStationsLength(snamesLength: number): number {
  return snamesLength + 3
}

/** Same as OpenSprinkler-App `OSApp.Stations.isMaster` — uses `options.mas` / `mas2`, not `masop` bitmask. */
function isOgMasterStation(sid: number, options: JsonAll['options'] | undefined): boolean {
  if (!options || typeof options !== 'object') return false
  const mas = typeof options.mas === 'number' ? options.mas : 0
  const mas2 = typeof options.mas2 === 'number' ? options.mas2 : 0
  const sid1 = sid + 1
  return (mas !== 0 && mas === sid1) || (mas2 !== 0 && mas2 === sid1)
}

export function parseLogEntries(
  entries: unknown[],
  snames: string[],
  options?: JsonAll['options'],
): ParsedLogEvent[] {
  const out: ParsedLogEvent[] = []
  const nst = snames.length
  const mergedLen = ogMergedStationsLength(nst)

  for (const row of entries) {
    if (!Array.isArray(row) || row.length < 4) continue
    const pidRaw = asFiniteNumber(row[0])
    const pid = pidRaw !== null ? Math.floor(pidRaw) : 0
    let stationRaw: unknown = row[1]
    const durationSec = durationFromRow(row)
    const endN = asFiniteNumber(row[3])
    const endSec = endN !== null ? endN : 0
    const startSec = endSec - durationSec
    if (Number.isNaN(startSec) || startSec < 0) continue

    const fr = asFiniteNumber(row[4])
    const flowRate = fr !== null ? fr : undefined

    if (typeof stationRaw === 'string' && /^\d+$/.test(stationRaw.trim())) {
      stationRaw = Number(stationRaw)
    }

    if (typeof stationRaw === 'string') {
      const label = mapSpecialToken(stationRaw)
      const remapped = resolveSpecialStationIndex(nst, stationRaw)
      out.push({
        pid,
        stationKind: 'special',
        stationIndex: remapped,
        stationLabel: label,
        durationSec,
        startSec,
        endSec,
        flowRate,
        includeInStats: false,
        raw: row,
      })
      continue
    }

    if (typeof stationRaw !== 'number') continue

    const sid = stationRaw
    if (nst > 0 && mergedLen >= 2 && sid > mergedLen - 2) continue
    if (isOgMasterStation(sid, options)) continue

    const stationLabel = snames[sid] ?? `Station ${sid + 1}`
    out.push({
      pid,
      stationKind: 'zone',
      stationIndex: sid,
      stationLabel,
      durationSec,
      startSec,
      endSec,
      flowRate,
      includeInStats: true,
      raw: row,
    })
  }

  return out.sort((a, b) => a.startSec - b.startSec)
}

export function logSummaryStats(events: ParsedLogEvent[]): { totalEvents: number; totalRuntimeSec: number } {
  let totalEvents = 0
  let totalRuntimeSec = 0
  for (const e of events) {
    if (!e.includeInStats) continue
    totalEvents += 1
    totalRuntimeSec += e.durationSec
  }
  return { totalEvents, totalRuntimeSec }
}

export function formatDurationShort(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h}h ${rm}m` : `${h}h`
}

/** Calendar day key in local timezone */
export function localDayKey(epochSec: number): string {
  const d = new Date(epochSec * 1000)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}
