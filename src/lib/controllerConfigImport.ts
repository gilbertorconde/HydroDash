/**
 * Import flow aligned with OpenSprinkler-App `import-export.js` (sequential /co, /cs, /dp, /cs name chunks, /cp).
 * Export is the raw `/ja` document (same shape as OG `JSON.stringify(controller)`).
 */
import type { JsonAll, ProgramRow } from '../api/types'
import { getProgramRange, programToVParam } from './programCodec'
import { OPTION_KEY_INDEX } from './opensprinklerOptions'

export type OpenSprinklerControllerBackup = {
  settings: Record<string, unknown>
  options: Record<string, unknown>
  stations: JsonAll['stations'] & {
    snames: string[]
    masop?: number[]
    masop2?: number[]
    ignore_rain?: number[]
    ignore_sn1?: number[]
    ignore_sn2?: number[]
    stn_dis?: number[]
    stn_spe?: number[]
    stn_seq?: number[]
    act_relay?: number[]
  }
  programs: {
    nprogs?: number
    pd: unknown[]
  }
  /** RF / extension special station payloads (firmware 2.1.6+). */
  special?: Record<string, { st: number; sd: string }>
  status?: unknown
}

const SKIP_OPTION_IF_ZERO: (keyof typeof OPTION_KEY_INDEX)[] = [
  'ntp',
  'ar',
  'seq',
  'urs',
  'rso',
  'ipas',
  'lg',
]

function coJsonInner(obj: Record<string, unknown>): string {
  return JSON.stringify(obj).slice(1, -1)
}

function fwv(options: Record<string, unknown>): number {
  const v = options.fwv
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function sanitizeCoString(val: unknown, useUnderscores: boolean): string | number {
  if (typeof val === 'boolean') return val ? 1 : 0
  if (typeof val === 'number') return val
  if (typeof val === 'string') return useUnderscores ? val.replace(/\s/g, '_') : val
  return String(val)
}

export function parseOpenSprinklerControllerBackup(raw: unknown): OpenSprinklerControllerBackup {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid JSON')
  const o = raw as Record<string, unknown>
  const payload =
    o.hydrodashControllerBackup && typeof o.hydrodashControllerBackup === 'object'
      ? (o.hydrodashControllerBackup as Record<string, unknown>).payload
      : raw

  if (!payload || typeof payload !== 'object') throw new Error('Invalid backup root')

  const p = payload as Record<string, unknown>
  if (!p.settings || typeof p.settings !== 'object') {
    throw new Error('Missing settings (expected a full controller backup: settings, options, stations, programs)')
  }
  if (!p.options || typeof p.options !== 'object') throw new Error('Missing options')
  if (!p.stations || typeof p.stations !== 'object') throw new Error('Missing stations')
  if (!p.programs || typeof p.programs !== 'object') throw new Error('Missing programs')

  const programs = p.programs as Record<string, unknown>
  if (!Array.isArray(programs.pd)) throw new Error('Missing programs.pd array')

  return p as unknown as OpenSprinklerControllerBackup
}

/** True if backup or current device options suggest network identity may change after import. */
export function controllerBackupNetworkWarning(
  backup: OpenSprinklerControllerBackup,
  current: JsonAll,
): boolean {
  const b = backup.options
  const c = current.options ?? {}
  if (fwv(b) < 210 || fwv(c) < 210) return false
  for (const k of ['hp0', 'hp1', 'dhcp', 'devid'] as const) {
    if (b[k] !== c[k]) return true
  }
  return false
}

type OsCommand = (path: string, params?: Record<string, string | number | boolean | undefined>) => Promise<void>

/**
 * Apply backup to the active controller. Destructive: replaces options, stations, and all programs.
 */
export async function importOpenSprinklerControllerBackup(
  backup: OpenSprinklerControllerBackup,
  current: JsonAll,
  osCommand: OsCommand,
): Promise<void> {
  const data = backup
  const currentOpts = current.options ?? {}
  const backupOpts = data.options ?? {}
  const backupFw = fwv(backupOpts)
  const currentFw = fwv(currentOpts)
  const useUnderscores = currentFw >= 208

  if (backupFw >= 210 && currentFw < 210) {
    throw new Error(
      'This backup was exported from firmware 2.1.0 or newer. Update the controller firmware, then import again.',
    )
  }

  if (backupFw < 210 && currentFw >= 210) {
    throw new Error(
      'Programs in this backup use a legacy format. Apply it on the controller with firmware that still accepts it, export a new backup, then import that file here.',
    )
  }

  const coParams: Record<string, string | number | boolean> = {}

  for (const key of Object.keys(OPTION_KEY_INDEX) as (keyof typeof OPTION_KEY_INDEX)[]) {
    if (!Object.prototype.hasOwnProperty.call(backupOpts, key)) continue
    const optVal = backupOpts[key]
    const idx = OPTION_KEY_INDEX[key]
    if (SKIP_OPTION_IF_ZERO.includes(key) && optVal === 0) continue
    if (key === 'dhcp') {
      if (Number(currentOpts.dhcp) === 1) {
        coParams.dhcp = 1
      }
      continue
    }
    coParams[key] = sanitizeCoString(optVal, useUnderscores) as string | number | boolean
  }

  if (backupFw < 211 && currentFw >= 211) {
    coParams.lg = 1
  }

  const st = data.settings ?? {}
  if (typeof st.wto === 'object' && st.wto !== null && currentFw >= 215) {
    coParams.wto = coJsonInner(st.wto as Record<string, unknown>) as unknown as string
  }
  if (typeof st.ifkey === 'string' && currentFw >= 217) {
    coParams.ifkey = st.ifkey
  }
  if (typeof st.dname === 'string' && currentFw >= 2191) {
    coParams.dname = st.dname
  }
  if (typeof st.mqtt === 'object' && st.mqtt !== null && currentFw >= 2191) {
    coParams.mqtt = coJsonInner(st.mqtt as Record<string, unknown>) as unknown as string
  }
  if (typeof st.email === 'object' && st.email !== null && currentFw >= 2191) {
    coParams.email = coJsonInner(st.email as Record<string, unknown>) as unknown as string
  }
  if (typeof st.otc === 'object' && st.otc !== null && currentFw >= 2191) {
    coParams.otc = coJsonInner(st.otc as Record<string, unknown>) as unknown as string
  }

  coParams.loc = String(st.loc ?? '').replace(/\s/g, '_')

  await osCommand('/co', coParams)

  const stations = data.stations
  const snames = stations.snames ?? []
  const csParams: Record<string, string | number> = {}

  if (Array.isArray(stations.masop)) {
    for (let i = 0; i < stations.masop.length; i++) {
      csParams[`m${i}`] = stations.masop[i]!
    }
  }
  if (Array.isArray(stations.masop2)) {
    for (let i = 0; i < stations.masop2.length; i++) {
      csParams[`n${i}`] = stations.masop2[i]!
    }
  }
  if (Array.isArray(stations.ignore_rain)) {
    for (let i = 0; i < stations.ignore_rain.length; i++) {
      csParams[`i${i}`] = stations.ignore_rain[i]!
    }
  }
  if (Array.isArray(stations.ignore_sn1)) {
    for (let i = 0; i < stations.ignore_sn1.length; i++) {
      csParams[`j${i}`] = stations.ignore_sn1[i]!
    }
  }
  if (Array.isArray(stations.ignore_sn2)) {
    for (let i = 0; i < stations.ignore_sn2.length; i++) {
      csParams[`k${i}`] = stations.ignore_sn2[i]!
    }
  }
  if (Array.isArray(stations.stn_dis)) {
    for (let i = 0; i < stations.stn_dis.length; i++) {
      csParams[`d${i}`] = stations.stn_dis[i]!
    }
  }
  if (Array.isArray(stations.stn_spe)) {
    for (let i = 0; i < stations.stn_spe.length; i++) {
      csParams[`p${i}`] = stations.stn_spe[i]!
    }
  }
  if (Array.isArray(stations.stn_seq)) {
    for (let i = 0; i < stations.stn_seq.length; i++) {
      csParams[`q${i}`] = stations.stn_seq[i]!
    }
  }
  if (Array.isArray(stations.act_relay)) {
    for (let i = 0; i < stations.act_relay.length; i++) {
      csParams[`a${i}`] = stations.act_relay[i]!
    }
  }

  await osCommand('/cs', csParams)
  await osCommand('/dp', { pid: -1 })

  const ncs = Math.ceil(Math.max(snames.length, 1) / 16)
  for (let k = 0; k < ncs; k++) {
    const chunk: Record<string, string> = {}
    for (let i = k * 16; i < (k + 1) * 16 && i < snames.length; i++) {
      const name = snames[i]!
      chunk[`s${i}`] = useUnderscores ? name.replace(/\s/g, '_') : name
    }
    if (Object.keys(chunk).length > 0) {
      await osCommand('/cs', chunk as Record<string, string | number>)
    }
  }

  const pd = data.programs.pd
  for (let i = 0; i < pd.length; i++) {
    const row = pd[i]
    if (!Array.isArray(row) || row.length < 6) {
      throw new Error(`Invalid program row at index ${i}`)
    }
    const prog = row as ProgramRow
    const v = programToVParam(prog)
    const { endr, from, to } = getProgramRange(prog)
    const name = String(prog[5] ?? '')
    await osCommand('/cp', { pid: -1, name, v, endr, from, to })
  }

  const special = data.special ?? {}
  if (currentFw >= 216) {
    for (const sid of Object.keys(special)) {
      const info = special[sid]
      if (!info || typeof info.st !== 'number' || typeof info.sd !== 'string') continue
      await osCommand('/cs', {
        sid: Number(sid),
        st: info.st,
        sd: info.sd,
      })
    }
  }
}

export function exportControllerDocument(ja: JsonAll): Record<string, unknown> {
  return JSON.parse(JSON.stringify(ja)) as Record<string, unknown>
}
