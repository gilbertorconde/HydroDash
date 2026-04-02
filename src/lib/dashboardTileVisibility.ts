import { useSyncExternalStore } from 'react'
import { DASHBOARD_TILE_IDS, type DashboardTileId } from './dashboardTileOrder'

const STORAGE_KEY = 'hydrodash.dashboardTileVisibility'
export const DASHBOARD_TILE_VISIBILITY_CHANGED = 'hydrodash-dashboard-tile-visibility-changed'

function defaultVisibility(): Record<DashboardTileId, boolean> {
  return {
    controller: true,
    live: true,
    sensors: true,
    history: true,
    quickrun: true,
  }
}

/** Ordered list of tiles that are enabled, preserving `order`. */
export function visibleTileIdsOrdered(
  visibility: Record<DashboardTileId, boolean>,
  order: readonly DashboardTileId[],
): DashboardTileId[] {
  return order.filter((id) => visibility[id])
}

export function loadDashboardTileVisibility(): Record<DashboardTileId, boolean> {
  const allOn = defaultVisibility()
  if (typeof window === 'undefined') return allOn
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return allOn
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return allOn
    const o = parsed as Record<string, unknown>
    const out = { ...allOn }
    for (const id of DASHBOARD_TILE_IDS) {
      if (id in o) out[id] = Boolean(o[id])
    }
    if (!DASHBOARD_TILE_IDS.some((id) => out[id])) out.controller = true
    return out
  } catch {
    return allOn
  }
}

function saveVisibility(v: Record<DashboardTileId, boolean>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

function subscribe(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const fn = () => cb()
  window.addEventListener(DASHBOARD_TILE_VISIBILITY_CHANGED, fn)
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(DASHBOARD_TILE_VISIBILITY_CHANGED, fn)
    window.removeEventListener('storage', fn)
  }
}

function snapshot(): string {
  return JSON.stringify(loadDashboardTileVisibility())
}

export function useDashboardTileVisibility(): Record<DashboardTileId, boolean> {
  const json = useSyncExternalStore(
    subscribe,
    snapshot,
    () => JSON.stringify(defaultVisibility()),
  )
  return JSON.parse(json) as Record<DashboardTileId, boolean>
}

/**
 * Replace stored visibility. Refuses to persist if that would hide every tile
 * (returns false). Ensures at least one tile stays on.
 */
export function persistDashboardTileVisibility(next: Record<DashboardTileId, boolean>): boolean {
  if (!DASHBOARD_TILE_IDS.some((id) => next[id])) return false
  saveVisibility(next)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DASHBOARD_TILE_VISIBILITY_CHANGED))
  return true
}

/** Toggle one tile; returns null if that would disable the last visible tile. */
export function visibilityWithToggle(
  prev: Record<DashboardTileId, boolean>,
  id: DashboardTileId,
  enabled: boolean,
): Record<DashboardTileId, boolean> | null {
  const next = { ...prev, [id]: enabled }
  if (!DASHBOARD_TILE_IDS.some((i) => next[i])) return null
  return next
}
