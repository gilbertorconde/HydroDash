import type { JsonAll } from '../api/types'

/**
 * Build `/cs` query params to reset station attributes (OpenSprinkler-App options.js).
 */
export function buildResetStationAttributesParams(data: JsonAll): Record<string, number> {
  const st = data.stations ?? {}
  const nbrd =
    typeof data.settings?.nbrd === 'number'
      ? data.settings.nbrd
      : typeof data.programs?.nboards === 'number'
        ? data.programs.nboards
        : 1
  const boards = Math.max(1, Math.min(16, nbrd))
  const out: Record<string, number> = {}
  const snames = st.snames ?? []

  if (Array.isArray(st.stn_grp)) {
    for (let i = 0; i < snames.length; i++) out[`g${i}`] = 0
  }

  if (data.options?.mas !== undefined) {
    for (let i = 0; i < boards; i++) out[`m${i}`] = 255
  }
  if (data.options?.mas2 !== undefined) {
    for (let i = 0; i < boards; i++) out[`n${i}`] = 0
  }
  if (Array.isArray(st.ignore_rain)) {
    for (let i = 0; i < boards; i++) out[`i${i}`] = 0
  }
  if (Array.isArray(st.ignore_sn1)) {
    for (let i = 0; i < boards; i++) out[`j${i}`] = 0
  }
  if (Array.isArray(st.ignore_sn2)) {
    for (let i = 0; i < boards; i++) out[`k${i}`] = 0
  }
  if (Array.isArray(st.act_relay)) {
    for (let i = 0; i < boards; i++) out[`a${i}`] = 0
  }
  if (Array.isArray(st.stn_dis)) {
    for (let i = 0; i < boards; i++) out[`d${i}`] = 0
  }
  if (Array.isArray(st.stn_seq)) {
    for (let i = 0; i < boards; i++) out[`q${i}`] = 255
  }
  if (Array.isArray(st.stn_spe)) {
    for (let i = 0; i < boards; i++) out[`p${i}`] = 0
  }

  return out
}
