import type { ControllerState, ProgramRow } from '../api/types'
import { isProgramActiveOnController, OS_QUEUE_PID_NON_SCHEDULED_MIN } from './opensprinklerRuntime'
import type { NotificationServiceKey } from '../server/notifications/types'
import { DEFAULT_NOTIFICATION_ROUTE } from '../server/notifications/types'

export type PollerSnapshotV1 = {
  v: 1
  nSta: number
  stationOn: boolean[]
  activeScheduledPids: number[]
  manualLikeRunning: boolean
  rd: number
  rdst: number
  en: number
  sn1: number
  sn2: number
  pq: number
  nq: number
  pt: number
  wterr: number
}

export type PendingNotification = {
  key: NotificationServiceKey
  title: string
  body: string
  route: string
  payload?: Record<string, unknown>
}

function stationRunningFromSbits(sbits: number[] | undefined, sid: number, nSta: number): boolean {
  if (!sbits?.length || sid < 0 || sid >= nSta) return false
  const board = Math.floor(sid / 8)
  const bit = sid % 8
  const v = sbits[board]
  if (v === undefined) return false
  return ((Number(v) >> bit) & 1) === 1
}

function programName(pd: ProgramRow[], pid: number): string {
  const row = pd[pid]
  const n = row?.[5]
  return typeof n === 'string' && n.trim() ? n.trim() : `Program ${pid + 1}`
}

export function buildPollerSnapshotV1(
  jc: ControllerState,
  js: { sn: number[]; nstations?: number },
  pd: ProgramRow[],
): PollerSnapshotV1 {
  const sn = js.sn ?? []
  const nSta = Math.max(js.nstations ?? 0, sn.length, 1)
  const sbits = jc.sbits as number[] | undefined
  const ps = jc.ps as [number, number, number, number][] | undefined

  const stationOn: boolean[] = []
  for (let i = 0; i < nSta; i++) {
    stationOn.push(stationRunningFromSbits(sbits, i, nSta))
  }

  const activeScheduledPids: number[] = []
  for (let pid = 0; pid < pd.length; pid++) {
    if (isProgramActiveOnController(pid, pd, ps, sn, nSta, null)) activeScheduledPids.push(pid)
  }
  activeScheduledPids.sort((a, b) => a - b)

  let manualLikeRunning = false
  for (let sid = 0; sid < nSta; sid++) {
    if ((sn[sid] ?? 0) <= 0) continue
    const ps0 = ps?.[sid]?.[0] ?? 0
    if (ps0 >= OS_QUEUE_PID_NON_SCHEDULED_MIN) {
      manualLikeRunning = true
      break
    }
  }

  return {
    v: 1,
    nSta,
    stationOn,
    activeScheduledPids,
    manualLikeRunning,
    rd: Number(jc.rd ?? 0),
    rdst: Number(jc.rdst ?? 0),
    en: Number(jc.en ?? 0),
    sn1: Number(jc.sn1 ?? 0),
    sn2: Number(jc.sn2 ?? 0),
    pq: Number(jc.pq ?? 0),
    nq: Number(jc.nq ?? 0),
    pt: Number(jc.pt ?? 0),
    wterr: Number(jc.wterr ?? 0),
  }
}

function rainDelayActive(s: PollerSnapshotV1): boolean {
  return s.rd > 0
}

export function diffPollerSnapshots(
  prev: PollerSnapshotV1 | null,
  curr: PollerSnapshotV1,
  siteLabel: string,
  pd: ProgramRow[],
): PendingNotification[] {
  if (!prev) return []

  const prefix = siteLabel ? `[${siteLabel}] ` : ''
  const out: PendingNotification[] = []

  const n = Math.min(prev.stationOn.length, curr.stationOn.length, curr.nSta, prev.nSta)
  for (let i = 0; i < n; i++) {
    if (!prev.stationOn[i] && curr.stationOn[i]) {
      out.push({
        key: 'station_started',
        title: `${prefix}Zone ${i + 1} started`,
        body: `Zone ${i + 1} is now watering.`,
        route: DEFAULT_NOTIFICATION_ROUTE.station_started,
        payload: { stationIndex: i },
      })
    }
    if (prev.stationOn[i] && !curr.stationOn[i]) {
      out.push({
        key: 'station_stopped',
        title: `${prefix}Zone ${i + 1} stopped`,
        body: `Zone ${i + 1} finished or was turned off.`,
        route: DEFAULT_NOTIFICATION_ROUTE.station_stopped,
        payload: { stationIndex: i },
      })
    }
  }

  const prevSet = new Set(prev.activeScheduledPids)
  const currSet = new Set(curr.activeScheduledPids)
  for (const pid of currSet) {
    if (!prevSet.has(pid)) {
      out.push({
        key: 'program_run_started',
        title: `${prefix}${programName(pd, pid)} started`,
        body: `Program is running on the controller.`,
        route: DEFAULT_NOTIFICATION_ROUTE.program_run_started,
        payload: { programIndex: pid },
      })
    }
  }
  for (const pid of prevSet) {
    if (!currSet.has(pid)) {
      out.push({
        key: 'program_run_finished',
        title: `${prefix}${programName(pd, pid)} finished`,
        body: `Program is no longer running.`,
        route: DEFAULT_NOTIFICATION_ROUTE.program_run_finished,
        payload: { programIndex: pid },
      })
    }
  }

  if (!prev.manualLikeRunning && curr.manualLikeRunning) {
    out.push({
      key: 'program_run_started',
      title: `${prefix}Manual / quick run started`,
      body: 'A non-scheduled run is active (manual, test, or quick run).',
      route: DEFAULT_NOTIFICATION_ROUTE.program_run_started,
      payload: { manual: true },
    })
  }
  if (prev.manualLikeRunning && !curr.manualLikeRunning) {
    out.push({
      key: 'program_run_finished',
      title: `${prefix}Manual / quick run finished`,
      body: 'Non-scheduled run ended.',
      route: DEFAULT_NOTIFICATION_ROUTE.program_run_finished,
      payload: { manual: true },
    })
  }

  const prevRain = rainDelayActive(prev)
  const currRain = rainDelayActive(curr)
  if (!prevRain && currRain) {
    out.push({
      key: 'rain_delay_set',
      title: `${prefix}Rain delay set`,
      body: curr.rdst ? `Rain delay active (until ${curr.rdst}).` : 'Rain delay is now active.',
      route: DEFAULT_NOTIFICATION_ROUTE.rain_delay_set,
    })
  }
  if (prevRain && currRain && curr.rd > prev.rd) {
    out.push({
      key: 'rain_delay_set',
      title: `${prefix}Rain delay extended`,
      body: 'Rain delay duration increased.',
      route: DEFAULT_NOTIFICATION_ROUTE.rain_delay_set,
    })
  }
  if (prevRain && !currRain) {
    out.push({
      key: 'rain_delay_cleared',
      title: `${prefix}Rain delay cleared`,
      body: 'Rain delay is off.',
      route: DEFAULT_NOTIFICATION_ROUTE.rain_delay_cleared,
    })
  }

  if (prev.wterr !== curr.wterr && curr.wterr !== 0) {
    out.push({
      key: 'weather_adjust_error',
      title: `${prefix}Weather adjustment issue`,
      body: `Weather error code: ${curr.wterr}`,
      route: DEFAULT_NOTIFICATION_ROUTE.weather_adjust_error,
      payload: { wterr: curr.wterr },
    })
  }

  if (prev.sn1 !== curr.sn1) {
    out.push({
      key: 'sensor_sn1',
      title: `${prefix}Sensor 1 changed`,
      body: `Value: ${curr.sn1}`,
      route: DEFAULT_NOTIFICATION_ROUTE.sensor_sn1,
      payload: { sn1: curr.sn1 },
    })
  }
  if (prev.sn2 !== curr.sn2) {
    out.push({
      key: 'sensor_sn2',
      title: `${prefix}Sensor 2 changed`,
      body: `Value: ${curr.sn2}`,
      route: DEFAULT_NOTIFICATION_ROUTE.sensor_sn2,
      payload: { sn2: curr.sn2 },
    })
  }

  if (prev.pq !== curr.pq || prev.nq !== curr.nq || prev.pt !== curr.pt) {
    out.push({
      key: 'program_queue_changed',
      title: `${prefix}Program queue changed`,
      body: `Queue: nq=${curr.nq}, pq=${curr.pq}, pt=${curr.pt}`,
      route: DEFAULT_NOTIFICATION_ROUTE.program_queue_changed,
    })
  }

  if (prev.en !== curr.en) {
    out.push({
      key: 'controller_enable_changed',
      title: `${prefix}Controller ${curr.en ? 'enabled' : 'disabled'}`,
      body: curr.en ? 'Operation enabled.' : 'Operation disabled.',
      route: DEFAULT_NOTIFICATION_ROUTE.controller_enable_changed,
    })
  }

  return out
}

export function parsePollerSnapshotJson(raw: string | null): PollerSnapshotV1 | null {
  if (!raw?.trim()) return null
  try {
    const j = JSON.parse(raw) as PollerSnapshotV1
    if (j?.v !== 1 || !Array.isArray(j.stationOn)) return null
    return j
  } catch {
    return null
  }
}
