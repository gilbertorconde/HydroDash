import type { ProgramRow } from '../api/types'

/**
 * OpenSprinkler runtime queue uses sentinel `pid` values for non-scheduled runs.
 * Scheduled programs use `q->pid = pid+1` (1-based program index).
 * Manual `/mp` and run-once set `q->pid = 254` (see OpenSprinkler-Firmware main.cpp
 * `manual_start_program`); test patterns may use `99` (opensprinkler_server.cpp).
 * `/jc` → `ps[sid][0]` echoes that queue pid, so Quick Run cannot match `ps[0] === programIndex`.
 */
export const OS_QUEUE_PID_NON_SCHEDULED_MIN = 99

/** UI: max wait for jc/js polling to reflect a started run before clearing “starting” state. */
export const CONTROLLER_ACTION_UI_TIMEOUT_MS = 20_000

const STORAGE_KEY = 'hydrodash.quickRunManualPid'

export function readQuickRunManualPid(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    if (v == null) return null
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export function writeQuickRunManualPid(pid: number | null): void {
  if (typeof window === 'undefined') return
  try {
    if (pid == null) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, String(pid))
  } catch {
    /* ignore quota / private mode */
  }
}

export function stationMatchesProgramRuntime(
  pid: number,
  sid: number,
  pd: ProgramRow[],
  ps: [number, number, number, number][] | undefined,
  sn: number[],
  manualQuickRunPid: number | null,
): boolean {
  const prog = pd[pid]
  if (!prog) return false
  const durs = prog[4]
  if ((durs[sid] ?? 0) <= 0) return false
  if ((sn[sid] ?? 0) <= 0) return false
  const ps0 = ps?.[sid]?.[0] ?? 0
  const devicePid = pid + 1
  if (ps0 === devicePid) return true
  if (ps0 >= OS_QUEUE_PID_NON_SCHEDULED_MIN && manualQuickRunPid === pid) return true
  return false
}

/**
 * True if program `pid` (0-based index in `pd`) has at least one station that is
 * actively watering and the runtime queue attributes it to this program or to a
 * manual/run-once queue entry we attributed via {@link readQuickRunManualPid}.
 */
export function isProgramActiveOnController(
  pid: number,
  pd: ProgramRow[],
  ps: [number, number, number, number][] | undefined,
  sn: number[],
  nSta: number,
  manualQuickRunPid: number | null,
): boolean {
  for (let sid = 0; sid < nSta; sid++) {
    if (stationMatchesProgramRuntime(pid, sid, pd, ps, sn, manualQuickRunPid)) return true
  }
  return false
}
