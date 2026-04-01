import type { JsonAll } from '../api/types'

/** OpenSprinkler: parallel stations use group id 255. */
export const PARALLEL_GID_VALUE = 255

export function stationBoardBit(boards: number[] | undefined, sid: number): boolean {
  if (!boards?.length) return false
  const bid = Math.floor(sid / 8)
  const mask = 1 << (sid % 8)
  return ((boards[bid] ?? 0) & mask) !== 0
}

export type StationAttrLabels = {
  master1: boolean
  master2: boolean
  ignoreRain: boolean
  ignoreSn1: boolean
  ignoreSn2: boolean
  sequential: boolean
  special: boolean
  actRelay: boolean
}

export function getStationAttrLabels(sid: number, stations: JsonAll['stations']): StationAttrLabels {
  const stnGrp = stations.stn_grp
  const sequential =
    stnGrp && stnGrp.length > sid
      ? stnGrp[sid] !== PARALLEL_GID_VALUE
      : stationBoardBit(stations.stn_seq, sid)

  return {
    master1: stationBoardBit(stations.masop, sid),
    master2: stationBoardBit(stations.masop2, sid),
    ignoreRain: stationBoardBit(stations.ignore_rain, sid),
    ignoreSn1: stationBoardBit(stations.ignore_sn1, sid),
    ignoreSn2: stationBoardBit(stations.ignore_sn2, sid),
    sequential,
    special: stationBoardBit(stations.stn_spe, sid),
    actRelay: stationBoardBit(stations.act_relay, sid),
  }
}

export function jeEntryForSid(
  je: Record<string, unknown> | undefined,
  sid: number,
): Record<string, unknown> | null {
  if (!je || typeof je !== 'object') return null
  const keys = [`${sid}`, String(sid)]
  for (const k of keys) {
    if (k in je) {
      const v = je[k]
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    }
  }
  return null
}
