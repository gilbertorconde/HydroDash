import type { ProgramRow } from '../api/types'
import {
  flagEnabled,
  flagDateRange,
  flagFixedStart,
  getProgramDayType,
  getProgramRestriction,
} from './programCodec'
import { decodeStartToken, isStartDisabled } from './startTimeCodec'
import { unpackEpochDay16 } from './osDate'

/** JS `Date.getDay()`: 0 = Sun → OpenSprinkler weekday bit (Mon = 0). */
export function jsWeekdayToOsBit(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1
}

function inOsDateRange(from: number, to: number, epochDay: number): boolean {
  return epochDay >= from && epochDay <= to
}

export function programRunsOnCalendarDay(
  prog: ProgramRow,
  date: Date,
  epochDay: number,
): boolean {
  const [flag, days0, days1] = prog
  if (!flagEnabled(flag)) return false

  const [, , , , , , range] = prog
  if (flagDateRange(flag) && !inOsDateRange(range[1], range[2], epochDay)) return false

  const rest = getProgramRestriction(flag)
  const dom = date.getDate()
  if (rest === 'odd' && dom % 2 === 0) return false
  if (rest === 'even' && dom % 2 === 1) return false

  const kind = getProgramDayType(flag)
  if (kind === 'weekly') {
    const bit = jsWeekdayToOsBit(date.getDay())
    return ((days0 >> bit) & 1) === 1
  }
  if (kind === 'single') {
    const ep = unpackEpochDay16(days0, days1)
    return ep === epochDay
  }
  if (kind === 'monthly') {
    if (days0 === 0) {
      const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
      return dom === last
    }
    return dom === days0
  }
  return false
}

function resolveStartMinutes(
  token: number,
  sunriseMin: number,
  sunsetMin: number,
): number | null {
  const d = decodeStartToken(token)
  if (d.kind === 'disabled') return null
  if (d.kind === 'clock') return d.minutes
  if (d.kind === 'sunrise') {
    let m = sunriseMin + d.offsetMin
    m = ((m % 1440) + 1440) % 1440
    return m
  }
  let m = sunsetMin + d.offsetMin
  m = ((m % 1440) + 1440) % 1440
  return m
}

function totalActiveDurationMinutes(durs: number[]): number {
  const sec = durs.reduce((a, b) => a + (b > 0 ? b : 0), 0)
  return Math.max(1, Math.ceil(sec / 60))
}

export type SchedulePreviewEvent = {
  startMin: number
  endMin: number
  pid: number
  name: string
}

function pushEventsForStarts(
  starts: [number, number, number, number],
  fixed: boolean,
  sunriseMin: number,
  sunsetMin: number,
  pid: number,
  name: string,
  durs: number[],
  into: SchedulePreviewEvent[],
) {
  const durMin = totalActiveDurationMinutes(durs)
  if (fixed) {
    for (const t of starts) {
      if (isStartDisabled(t)) continue
      const m = resolveStartMinutes(t, sunriseMin, sunsetMin)
      if (m == null) continue
      into.push({
        startMin: m,
        endMin: Math.min(1440, m + durMin),
        pid,
        name,
      })
    }
    return
  }
  const first = starts[0]
  const count = Math.max(0, Math.min(255, starts[1] ?? 0))
  const interval = Math.max(1, Math.min(1440, starts[2] ?? 30))
  const base = resolveStartMinutes(first, sunriseMin, sunsetMin)
  if (base == null) return
  for (let i = 0; i <= count; i++) {
    const m = base + i * interval
    if (m >= 1440) break
    into.push({
      startMin: m,
      endMin: Math.min(1440, m + durMin),
      pid,
      name,
    })
  }
}

export function buildSchedulePreview(
  pd: ProgramRow[],
  date: Date,
  epochDay: number,
  sunriseMin: number,
  sunsetMin: number,
): SchedulePreviewEvent[] {
  const out: SchedulePreviewEvent[] = []
  for (let pid = 0; pid < pd.length; pid++) {
    const prog = pd[pid]
    if (!programRunsOnCalendarDay(prog, date, epochDay)) continue
    const [flag, , , starts, durs, name] = prog
    const fixed = flagFixedStart(flag)
    pushEventsForStarts(starts, fixed, sunriseMin, sunsetMin, pid, name || `Program ${pid + 1}`, durs, out)
  }
  out.sort((a, b) => a.startMin - b.startMin || a.pid - b.pid)
  return out
}

export function formatClock(minutes: number): string {
  const m = Math.max(0, Math.min(1439, Math.floor(minutes)))
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
