import type { ControllerState, ProgramRow } from '../../api/types'
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
  name: string
  /** Minutes after local midnight on the run day. */
  startMin: number
  /** 0 = today (controller time), 1 = tomorrow, … */
  dayOffset: number
  /** JS weekday (0 = Sun) of the run day. */
  weekday: number
}

/**
 * Next program start in the coming week from the simplified schedule preview (weekly, single,
 * monthly programs; interval programs are not covered). `devt` is controller-local epoch seconds.
 */
export function findNextScheduledRun(
  pd: ProgramRow[],
  devt: number | undefined,
  sunriseMin: number,
  sunsetMin: number,
): NextScheduledRun | null {
  if (!devt || devt <= 0 || pd.length === 0) return null
  const today = Math.floor(devt / 86400)
  const nowMin = Math.floor((devt % 86400) / 60)
  for (let offset = 0; offset < 7; offset++) {
    const epochDay = today + offset
    // `devt` is local time encoded as UTC; rebuild a local Date for weekday / day-of-month math.
    const u = new Date(epochDay * 86400000)
    const date = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), 12)
    const ev = buildSchedulePreview(pd, date, epochDay, sunriseMin, sunsetMin).find(
      (e) => offset > 0 || e.startMin > nowMin,
    )
    if (ev) return { name: ev.name, startMin: ev.startMin, dayOffset: offset, weekday: date.getDay() }
  }
  return null
}
