import { useSyncExternalStore } from 'react'

export const DASHBOARD_TILE_IDS = [
  'controller',
  'live',
  'sensors',
  'history',
  'quickrun',
] as const
export type DashboardTileId = (typeof DASHBOARD_TILE_IDS)[number]

const STORAGE_KEY = 'hydrodash.dashboardTileOrder'

const CHANGED = 'hydrodash-dashboard-tiles-changed'

const DEFAULT_ORDER: DashboardTileId[] = [...DASHBOARD_TILE_IDS]

function isValidTileId(x: unknown): x is DashboardTileId {
  return typeof x === 'string' && (DASHBOARD_TILE_IDS as readonly string[]).includes(x)
}

export function loadDashboardTileOrder(): DashboardTileId[] {
  if (typeof window === 'undefined') return [...DEFAULT_ORDER]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_ORDER]
    const filtered = parsed.filter(isValidTileId)
    const seen = new Set<string>()
    const unique = filtered.filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    for (const id of DASHBOARD_TILE_IDS) {
      if (!seen.has(id)) return [...DEFAULT_ORDER]
    }
    if (unique.length !== DASHBOARD_TILE_IDS.length) return [...DEFAULT_ORDER]
    return unique as DashboardTileId[]
  } catch {
    return [...DEFAULT_ORDER]
  }
}

function saveDashboardTileOrder(order: DashboardTileId[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    /* ignore quota / private mode */
  }
}

function subscribeDashboardTiles(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const fn = () => cb()
  window.addEventListener(CHANGED, fn)
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(CHANGED, fn)
    window.removeEventListener('storage', fn)
  }
}

function snapshotDashboardTiles(): string {
  return JSON.stringify(loadDashboardTileOrder())
}

/**
 * Tile order from localStorage; stable snapshot string for useSyncExternalStore.
 * Server snapshot is the default order so SSR matches first paint.
 */
export function useDashboardTileOrder(): DashboardTileId[] {
  const json = useSyncExternalStore(
    subscribeDashboardTiles,
    snapshotDashboardTiles,
    () => JSON.stringify([...DEFAULT_ORDER]),
  )
  return JSON.parse(json) as DashboardTileId[]
}

export function persistDashboardTileOrder(order: DashboardTileId[]): void {
  saveDashboardTileOrder(order)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED))
}
