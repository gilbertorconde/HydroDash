import type { ControllerState, ProgramRow } from '../../api/types'
import { formatMinutesWall } from '../../lib/formatLocale'
import { buildSchedulePreview } from '../../lib/schedulePreview'
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

/* ---------- Now running ---------- */

/** OpenSprinkler queue pids for non-program runs (matches OpenSprinkler-App labels). */
const QUEUE_PID_MANUAL = [99, 255]
const QUEUE_PID_RUN_ONCE = [98, 254]

export type RunningZone = {
  sid: number
  name: string
  programLabel: string
  /** Seconds left as of the `/jc` poll. */
  remainingSec: number
  /** Whole run length when derivable from `devt - start + remaining`, else null. */
  totalSec: number | null
}

export type QueuedZone = {
  sid: number
  name: string
  durationSec: number
  /** Device-local epoch seconds the zone is scheduled to start (0 = unknown). */
  startSec: number
}

function programNameAt(pd: ProgramRow[], pid: number): string {
  const n = pd[pid]?.[5]
  return typeof n === 'string' && n.trim() ? n.trim() : `Program ${pid + 1}`
}

/**
 * Human label for `ps[sid][0]` (1-based program index, or a manual / run-once sentinel).
 * Quick Run (`/mp`) also queues as run-once, so the remembered Quick Run program wins when it
 * waters this station.
 */
export function queuePidLabel(
  qpid: number,
  sid: number,
  pd: ProgramRow[],
  manualQuickRunPid: number | null,
): string {
  if (qpid >= 1 && qpid <= pd.length) return programNameAt(pd, qpid - 1)
  if (QUEUE_PID_RUN_ONCE.includes(qpid)) {
    if (manualQuickRunPid != null && (pd[manualQuickRunPid]?.[4]?.[sid] ?? 0) > 0) {
      return programNameAt(pd, manualQuickRunPid)
    }
    return 'Run-once'
  }
  if (QUEUE_PID_MANUAL.includes(qpid)) return 'Manual run'
  return qpid > 0 ? `Program ${qpid}` : 'Running'
}

function sbitOn(sbits: number[] | undefined, sid: number): boolean | null {
  if (!sbits?.length) return null
  const v = sbits[Math.floor(sid / 8)]
  if (v === undefined) return false
  return ((Number(v) >> sid % 8) & 1) === 1
}

/** 0-based master station indices from `options.mas` / `mas2` (1-based, 0 = none). */
export function masterStationIds(options: Record<string, unknown> | undefined): Set<number> {
  const out = new Set<number>()
  for (const k of ['mas', 'mas2']) {
    const v = options?.[k]
    if (typeof v === 'number' && v > 0) out.add(v - 1)
  }
  return out
}

/**
 * Split `/jc` runtime into zones watering now (station bit set) and zones waiting in the queue
 * (`ps` entry with a pid but station off). Master stations are skipped.
 */
export function buildNowRunning(opts: {
  jc: ControllerState | undefined
  /** `/js` station status, used only when `/jc` has no `sbits`. */
  sn: number[]
  stationNames: string[]
  pd: ProgramRow[]
  nSta: number
  masters: ReadonlySet<number>
  manualQuickRunPid: number | null
}): { running: RunningZone[]; queued: QueuedZone[] } {
  const { jc, sn, stationNames, pd, masters, manualQuickRunPid } = opts
  const running: RunningZone[] = []
  const queued: QueuedZone[] = []
  if (!jc) return { running, queued }
  const ps = jc.ps ?? []
  const devt = typeof jc.devt === 'number' ? jc.devt : 0
  const n = Math.max(opts.nSta, ps.length)
  for (let sid = 0; sid < n; sid++) {
    if (masters.has(sid)) continue
    const [qpid = 0, rem = 0, start = 0] = ps[sid] ?? []
    const on = sbitOn(jc.sbits, sid) ?? (sn[sid] ?? 0) > 0
    const name = stationNames[sid]?.trim() || `Zone ${sid + 1}`
    if (on) {
      const elapsed = start > 0 && devt >= start ? devt - start : null
      running.push({
        sid,
        name,
        programLabel: queuePidLabel(qpid, sid, pd, manualQuickRunPid),
        remainingSec: Math.max(0, rem),
        totalSec: elapsed != null && rem > 0 ? elapsed + rem : null,
      })
    } else if (qpid > 0 && rem > 0) {
      queued.push({ sid, name, durationSec: rem, startSec: start })
    }
  }
  queued.sort((a, b) => a.startSec - b.startSec || a.sid - b.sid)
  return { running, queued }
}

export type NextScheduledRun = {
  pid: number
  name: string
  /** Minutes after local midnight on the run day. */
  startMin: number
  /** Total program length in minutes (sum of zone durations, at least 1). */
  durationMin: number
  /** 0 = today (controller time), 1 = tomorrow, … */
  dayOffset: number
  /** JS weekday (0 = Sun) of the run day. */
  weekday: number
}

/**
 * Program starts in the coming week from the simplified schedule preview (weekly, single,
 * monthly programs; interval programs are not covered), soonest first. `devt` is
 * controller-local epoch seconds.
 */
export function findUpcomingRuns(
  pd: ProgramRow[],
  devt: number | undefined,
  sunriseMin: number,
  sunsetMin: number,
  limit = 20,
): NextScheduledRun[] {
  const out: NextScheduledRun[] = []
  if (!devt || devt <= 0 || pd.length === 0) return out
  const today = Math.floor(devt / 86400)
  const nowMin = Math.floor((devt % 86400) / 60)
  for (let offset = 0; offset < 7 && out.length < limit; offset++) {
    const epochDay = today + offset
    // `devt` is local time encoded as UTC; rebuild a local Date for weekday / day-of-month math.
    const u = new Date(epochDay * 86400000)
    const date = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), 12)
    for (const ev of buildSchedulePreview(pd, date, epochDay, sunriseMin, sunsetMin)) {
      if (offset === 0 && ev.startMin <= nowMin) continue
      out.push({
        pid: ev.pid,
        name: ev.name,
        startMin: ev.startMin,
        durationMin: Math.max(1, ev.endMin - ev.startMin),
        dayOffset: offset,
        weekday: date.getDay(),
      })
      if (out.length >= limit) break
    }
  }
  return out
}

export function findNextScheduledRun(
  pd: ProgramRow[],
  devt: number | undefined,
  sunriseMin: number,
  sunsetMin: number,
): NextScheduledRun | null {
  return findUpcomingRuns(pd, devt, sunriseMin, sunsetMin, 1)[0] ?? null
}

/* ---------- Formatting (controller-local time) ---------- */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "today" / "tomorrow" / "Thu". */
export function dayLabel(dayOffset: number, weekday: number): string {
  return dayOffset === 0 ? 'today' : dayOffset === 1 ? 'tomorrow' : WEEKDAYS[weekday]
}

/** "Morning Lawn tomorrow at 6:00 AM". */
export function formatNextRun(next: NextScheduledRun, is24Hour: boolean): string {
  const day = next.dayOffset === 0 ? '' : `${dayLabel(next.dayOffset, next.weekday)} `
  return `${next.name} ${day}at ${formatMinutesWall(next.startMin, is24Hour)}`
}

/**
 * Wall clock of a controller epoch (`devt`, `rdst`, `ps` start times). OpenSprinkler encodes
 * local time as if it were UTC, so format in UTC to get the controller's own clock.
 */
export function formatDeviceClock(epochSec: number, is24Hour: boolean): string {
  return formatMinutesWall(Math.floor((((epochSec % 86400) + 86400) % 86400) / 60), is24Hour)
}

/** "today 14:00", "tomorrow 06:00", "Thu 14:00" or "12 Oct 14:00" relative to `nowSec`. */
export function formatDeviceDateTime(epochSec: number, nowSec: number | undefined, is24Hour: boolean): string {
  const clock = formatDeviceClock(epochSec, is24Hour)
  const d = new Date(epochSec * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  if (nowSec && nowSec > 0) {
    const diff = Math.floor(epochSec / 86400) - Math.floor(nowSec / 86400)
    if (diff >= 0 && diff < 7) return `${dayLabel(diff, d.getUTCDay())} ${clock}`
  }
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${date} ${clock}`
}

/** `m:ss` or `h:mm:ss`. */
export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "45 min", "1 h 20 min", "2 h". */
export function formatMinutesLong(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
