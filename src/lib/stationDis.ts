/** OpenSprinkler `stn_dis` bitmask per expansion board (8 stations each). */
export function isStationDisabled(stnDis: number[] | undefined, sid: number): boolean {
  const board = Math.floor(sid / 8)
  const mask = stnDis?.[board] ?? 0
  return (mask & (1 << (sid % 8))) !== 0
}
