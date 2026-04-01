/** OpenSprinkler API error codes (subset) */
export const OS_RESULT = {
  SUCCESS: 1,
  UNAUTHORIZED: 2,
  MISMATCH: 3,
  DATA_MISSING: 16,
  OUT_OF_RANGE: 17,
  FORMAT_ERROR: 18,
} as const

export type ProgramRow = [
  flag: number,
  days0: number,
  days1: number,
  starts: [number, number, number, number],
  durations: number[],
  name: string,
  range: [endr: number, from: number, to: number],
]

export interface JsonAll {
  settings: Record<string, unknown>
  options: Record<string, unknown>
  stations: {
    snames: string[]
    maxlen?: number
    stn_grp?: number[]
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
  status: { sn: number[]; nstations: number }
  programs: {
    nprogs: number
    nboards: number
    mnp: number
    mnst: number
    pnsize: number
    pd: ProgramRow[]
  }
}

export interface ControllerState {
  devt?: number
  nbrd?: number
  en?: number
  sn1?: number
  sn2?: number
  rd?: number
  rdst?: number
  sunrise?: number
  sunset?: number
  pq?: number
  pt?: number
  nq?: number
  sbits?: number[]
  ps?: [number, number, number, number][]
  wtdata?: unknown
  wterr?: number
  loc?: string
  mqtt?: Record<string, unknown>
  email?: Record<string, unknown>
  otc?: Record<string, unknown>
  [key: string]: unknown
}

export function isResultError(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (typeof o.result !== 'number') return null
  if (o.result === 1) return null
  return o.result
}
