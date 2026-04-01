import type { ProgramRow } from '../api/types'

/** Build `v` query value for `/cp` (program body without name/range — range sent as from/to). */
export function programToVParam(pd: ProgramRow): string {
  const [flag, days0, days1, starts, durs] = pd
  const body: [number, number, number, number[], number[]] = [
    flag,
    days0,
    days1,
    starts,
    durs,
  ]
  return JSON.stringify(body)
}

export function getProgramRange(pd: ProgramRow): { endr: number; from: number; to: number } {
  const [, , , , , , range] = pd
  return { endr: range[0], from: range[1], to: range[2] }
}

export function cloneProgram(pd: ProgramRow): ProgramRow {
  const [flag, days0, days1, starts, durs, name, range] = pd
  return [
    flag,
    days0,
    days1,
    [...starts] as [number, number, number, number],
    [...durs],
    name,
    [...range] as [number, number, number],
  ]
}

/** Weekly schedule: Mon=bit0 … Sun=bit6 (LSB Monday per API doc). */
export function weeklyDays0(mon: boolean, tue: boolean, wed: boolean, thu: boolean, fri: boolean, sat: boolean, sun: boolean): number {
  let d = 0
  if (mon) d |= 1
  if (tue) d |= 2
  if (wed) d |= 4
  if (thu) d |= 8
  if (fri) d |= 16
  if (sat) d |= 32
  if (sun) d |= 64
  return d
}

export function parseWeeklyDays(days0: number): boolean[] {
  return Array.from({ length: 7 }, (_, i) => ((days0 >> i) & 1) === 1)
}

const FLAG_EN = 1
const FLAG_UWT = 2
const FLAG_RESTRICTION_MASK = 0b1100
const FLAG_DAY_TYPE_MASK = 0b110000
const FLAG_START_FIXED = 0b1000000
const FLAG_DATE_RANGE = 0b10000000

/** Bits 4–5: 0 weekly, 1 single-run, 2 monthly, 3 interval (API). */
export type ProgramDayType = 'weekly' | 'single' | 'monthly' | 'interval'

/** Bits 2–3: 0 none, 1 odd, 2 even. */
export type ProgramRestriction = 'none' | 'odd' | 'even'

export function flagEnabled(flag: number): boolean {
  return (flag & FLAG_EN) !== 0
}
export function flagUseWeather(flag: number): boolean {
  return (flag & FLAG_UWT) !== 0
}

export function getProgramDayType(flag: number): ProgramDayType {
  const t = (flag & FLAG_DAY_TYPE_MASK) >> 4
  if (t === 0) return 'weekly'
  if (t === 1) return 'single'
  if (t === 2) return 'monthly'
  return 'interval'
}

export function setProgramDayType(flag: number, kind: ProgramDayType): number {
  const t = kind === 'weekly' ? 0 : kind === 'single' ? 1 : kind === 'monthly' ? 2 : 3
  return (flag & ~FLAG_DAY_TYPE_MASK) | (t << 4)
}

export function flagWeekly(flag: number): boolean {
  return getProgramDayType(flag) === 'weekly'
}

export function getProgramRestriction(flag: number): ProgramRestriction {
  const r = (flag & FLAG_RESTRICTION_MASK) >> 2
  if (r === 1) return 'odd'
  if (r === 2) return 'even'
  return 'none'
}

export function setProgramRestriction(flag: number, r: ProgramRestriction): number {
  const bits = r === 'odd' ? 1 : r === 'even' ? 2 : 0
  return (flag & ~FLAG_RESTRICTION_MASK) | (bits << 2)
}

export function flagFixedStart(flag: number): boolean {
  return (flag & FLAG_START_FIXED) !== 0
}
export function flagDateRange(flag: number): boolean {
  return (flag & FLAG_DATE_RANGE) !== 0
}

export function setFlagEnabled(flag: number, on: boolean): number {
  return on ? flag | FLAG_EN : flag & ~FLAG_EN
}
export function setFlagUseWeather(flag: number, on: boolean): number {
  return on ? flag | FLAG_UWT : flag & ~FLAG_UWT
}
export function setFlagWeekly(flag: number): number {
  return setProgramDayType(flag, 'weekly')
}
export function setFlagFixedStart(flag: number, fixed: boolean): number {
  return fixed ? flag | FLAG_START_FIXED : flag & ~FLAG_START_FIXED
}
export function setFlagDateRange(flag: number, on: boolean): number {
  return on ? flag | FLAG_DATE_RANGE : flag & ~FLAG_DATE_RANGE
}

/** Minutes since midnight 0–1439 for simple fixed single start (disabled slots = -1). */
export function minutesToFixedStart(minutes: number): number {
  if (minutes < 0) return minutes
  return minutes & 0xffff
}

/** Repeating: start0 = first time minutes, start1 = count, start2 = interval minutes */
export function makeRepeatingStarts(
  firstMinute: number,
  repeatCount: number,
  intervalMinutes: number,
): [number, number, number, number] {
  return [minutesToFixedStart(firstMinute), repeatCount, intervalMinutes, 0]
}
