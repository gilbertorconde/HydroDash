import type { ProgramRow } from '../../api/types'
import { isStationDisabled } from '../../lib/stationDis'

/** Yesterday 00:00 through end of today (local), matching History `/jl` conventions. */
export function jlRangeLastTwoDays(): { start: number; end: number } {
  const now = new Date()
  const y = now.getFullYear()
  const mo = now.getMonth() + 1
  const day = now.getDate()
  const todayMidnightSec = Math.floor(new Date(y, mo - 1, day).getTime() / 1000)
  const yesterdayMidnightSec = todayMidnightSec - 86400
  return { start: yesterdayMidnightSec, end: todayMidnightSec + 86340 }
}

export function programWatersEnabledStation(
  pd: ProgramRow,
  stnDis: number[] | undefined,
  nSta: number,
): boolean {
  const durs = pd[4]
  for (let i = 0; i < nSta && i < durs.length; i++) {
    if ((durs[i] ?? 0) > 0 && !isStationDisabled(stnDis, i)) return true
  }
  return false
}

export function countWateringZones(pd: ProgramRow, stnDis: number[] | undefined, nSta: number): number {
  const durs = pd[4]
  let c = 0
  for (let i = 0; i < nSta && i < durs.length; i++) {
    if ((durs[i] ?? 0) > 0 && !isStationDisabled(stnDis, i)) c += 1
  }
  return c
}

export function weatherServiceNameFromWtdata(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const wp = (raw as Record<string, unknown>).wp
  return typeof wp === 'string' && wp.trim() ? wp.trim() : null
}
