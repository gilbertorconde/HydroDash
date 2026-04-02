import { useSyncExternalStore } from 'react'
import { cloneLayout, verticalCompactor } from 'react-grid-layout'
import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout'
import {
  DASHBOARD_TILE_IDS,
  type DashboardTileId,
  loadDashboardTileOrder,
} from './dashboardTileOrder'
import {
  DASHBOARD_TILE_VISIBILITY_CHANGED,
  loadDashboardTileVisibility,
  visibleTileIdsOrdered,
} from './dashboardTileVisibility'

const STORAGE_KEY = 'hydrodash.dashboardRglLayouts.2'
const CHANGED = 'hydrodash-dashboard-rgl-changed'

/** Shared with `useResponsiveLayout` + `GridLayout` on the dashboard. */
export const DASHBOARD_RGL_BREAKPOINTS = {
  lg: 1280,
  md: 960,
  sm: 640,
  xs: 480,
  xxs: 0,
} as const

/** Column counts per breakpoint — must match `buildDefaultDashboardLayouts` row math. */
export const DASHBOARD_RGL_COLS: Record<keyof ResponsiveLayouts, number> = {
  lg: 12,
  md: 12,
  sm: 6,
  /** Narrow viewports: one grid column so each card is full width (one per row). */
  xs: 1,
  xxs: 1,
}

/** Default grid row height (`h`) per tile when placing or adding a widget. */
export const DASHBOARD_TILE_DEFAULT_H: Record<DashboardTileId, number> = {
  controller: 7,
  live: 11,
  sensors: 9,
  history: 16,
  quickrun: 12,
}

/** Min/max `h` (grid rows) when editing height from the tile cog. */
export const DASHBOARD_TILE_ROW_BOUNDS: Record<DashboardTileId, { minH: number; maxH: number }> = {
  controller: { minH: 4, maxH: 40 },
  live: { minH: 6, maxH: 50 },
  sensors: { minH: 5, maxH: 45 },
  history: { minH: 8, maxH: 55 },
  quickrun: { minH: 6, maxH: 50 },
}

let layoutSnapshotCache: string | null = null

function invalidateLayoutSnapshotCache() {
  layoutSnapshotCache = null
}

function clampLayoutToCols(layout: Layout, cols: number): Layout {
  return layout.map((item) => {
    const w = Math.max(1, Math.min(item.w, cols))
    const x = Math.min(Math.max(0, item.x), Math.max(0, cols - w))
    const h = Math.max(1, item.h)
    const y = Math.max(0, item.y)
    return { ...item, x, y, w, h }
  })
}

/** Remove vertical gaps and out-of-bounds sizes from persisted layouts. */
export function sanitizeLayouts(layouts: ResponsiveLayouts): ResponsiveLayouts {
  const keys = ['lg', 'md', 'sm', 'xs', 'xxs'] as const
  const out = { ...layouts }
  for (const k of keys) {
    const n = DASHBOARD_RGL_COLS[k]
    const row = out[k] ?? []
    const clamped = clampLayoutToCols(row, n)
    out[k] = verticalCompactor.compact(cloneLayout(clamped), n)
  }
  return out
}

function isLayoutItem(x: unknown): x is LayoutItem {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.i === 'string' &&
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.w === 'number' &&
    typeof o.h === 'number'
  )
}

/** Default width in grid columns for a new tile (matches `placeRowMajor` math). */
function defaultTileWidthForBreakpoint(bp: keyof ResponsiveLayouts): number {
  const cols = DASHBOARD_RGL_COLS[bp]
  const tilesPerRow = bp === 'lg' ? 4 : bp === 'md' ? 3 : bp === 'sm' ? 2 : 1
  return Math.max(1, Math.floor(cols / tilesPerRow))
}

function placeRowMajor(
  order: readonly DashboardTileId[],
  cols: number,
  tilesPerRow: number,
  hOf: (id: DashboardTileId) => number,
): LayoutItem[] {
  const w = Math.max(1, Math.floor(cols / tilesPerRow))
  const out: LayoutItem[] = []
  let x = 0
  let y = 0
  let currentRowH = 0

  for (const id of order) {
    const h = hOf(id)
    if (x + w > cols) {
      y += currentRowH
      x = 0
      currentRowH = 0
    }
    out.push({ i: id, x, y, w, h })
    currentRowH = Math.max(currentRowH, h)
    x += w
    if (x >= cols) {
      y += currentRowH
      x = 0
      currentRowH = 0
    }
  }
  return out
}

export function buildDefaultDashboardLayouts(
  order: readonly DashboardTileId[],
): ResponsiveLayouts {
  const h = (id: DashboardTileId) => DASHBOARD_TILE_DEFAULT_H[id]
  if (order.length === 0) {
    return buildDefaultDashboardLayouts(['controller'])
  }
  return {
    lg: placeRowMajor(order, 12, 4, h),
    md: placeRowMajor(order, 12, 3, h),
    sm: placeRowMajor(order, 6, 2, h),
    xs: placeRowMajor(order, 1, 1, h),
    xxs: placeRowMajor(order, 1, 1, h),
  }
}

function normalizeBreakpointLayout(
  raw: unknown,
  cols: number,
  bp: keyof ResponsiveLayouts,
  visibleIds: readonly DashboardTileId[],
): Layout {
  const arr = Array.isArray(raw) ? raw.filter(isLayoutItem) : []
  const byId = new Map(arr.map((it) => [it.i, it]))
  const out: LayoutItem[] = []
  for (const id of visibleIds) {
    const existing = byId.get(id)
    if (existing && DASHBOARD_TILE_IDS.includes(id as DashboardTileId)) {
      out.push({ ...existing })
    } else {
      const bottomY = out.length > 0 ? Math.max(...out.map((it) => it.y + it.h)) : 0
      out.push({
        i: id,
        x: 0,
        y: bottomY,
        w: defaultTileWidthForBreakpoint(bp),
        h: DASHBOARD_TILE_DEFAULT_H[id],
      })
    }
  }
  const clamped = clampLayoutToCols(out, cols)
  return verticalCompactor.compact(cloneLayout(clamped), cols)
}

/**
 * Reconcile stored responsive layouts with the current visible tile set.
 * Keeps positions for tiles that still exist; appends defaults for newly visible tiles.
 */
export function normalizeDashboardLayoutsForVisible(
  stored: Partial<Record<keyof ResponsiveLayouts, unknown>> | null,
  visibleIds: readonly DashboardTileId[],
): ResponsiveLayouts {
  const defaults = buildDefaultDashboardLayouts(visibleIds)
  if (!stored || typeof stored !== 'object') return defaults
  const keys = ['lg', 'md', 'sm', 'xs', 'xxs'] as const
  const out = { ...defaults }
  for (const k of keys) {
    if (k in stored && stored[k] !== undefined) {
      out[k] = normalizeBreakpointLayout(stored[k], DASHBOARD_RGL_COLS[k], k, visibleIds)
    }
  }
  return out
}

/** Merge min/max height hints onto layout items for the grid (optional constraints). */
export function withLayoutHeightConstraints(layout: Layout): Layout {
  return layout.map((item) => {
    const id = item.i as DashboardTileId
    const b = DASHBOARD_TILE_ROW_BOUNDS[id]
    if (!b) return item
    return { ...item, minH: b.minH, maxH: b.maxH }
  })
}

export function setTileHeightInAllBreakpoints(
  layouts: ResponsiveLayouts,
  tileId: DashboardTileId,
  h: number,
): ResponsiveLayouts {
  const b = DASHBOARD_TILE_ROW_BOUNDS[tileId]
  const clamped = Math.max(b.minH, Math.min(b.maxH, Math.round(h)))
  const keys = ['lg', 'md', 'sm', 'xs', 'xxs'] as const
  const next: ResponsiveLayouts = { ...layouts }
  for (const k of keys) {
    const row = next[k] ?? []
    next[k] = row.map((item) =>
      item.i === tileId ? { ...item, h: clamped } : item,
    )
  }
  return sanitizeLayouts(next)
}

function readVisibleTileOrder(): DashboardTileId[] {
  const visibility = loadDashboardTileVisibility()
  const order = loadDashboardTileOrder()
  return visibleTileIdsOrdered(visibility, order)
}

function readLayoutsFromStorage(): ResponsiveLayouts {
  if (typeof window === 'undefined') {
    return buildDefaultDashboardLayouts([...DASHBOARD_TILE_IDS])
  }
  const visibleIds = readVisibleTileOrder()
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as unknown
      const normalized = normalizeDashboardLayoutsForVisible(
        parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null,
        visibleIds,
      )
      const sanitized = sanitizeLayouts(normalized)
      const next = JSON.stringify(sanitized)
      if (next !== stored) {
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          /* ignore */
        }
      }
      return sanitized
    }
  } catch {
    /* ignore */
  }
  const layouts = buildDefaultDashboardLayouts(visibleIds)
  saveDashboardLayouts(layouts)
  return layouts
}

function saveDashboardLayouts(layouts: ResponsiveLayouts): void {
  if (typeof window === 'undefined') return
  try {
    const json = JSON.stringify(layouts)
    localStorage.setItem(STORAGE_KEY, json)
    layoutSnapshotCache = json
  } catch {
    /* ignore */
  }
}

function subscribeDashboardLayouts(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const fn = () => {
    invalidateLayoutSnapshotCache()
    cb()
  }
  window.addEventListener(CHANGED, fn)
  window.addEventListener('storage', fn)
  window.addEventListener(DASHBOARD_TILE_VISIBILITY_CHANGED, fn)
  return () => {
    window.removeEventListener(CHANGED, fn)
    window.removeEventListener('storage', fn)
    window.removeEventListener(DASHBOARD_TILE_VISIBILITY_CHANGED, fn)
  }
}

function snapshotDashboardLayouts(): string {
  if (layoutSnapshotCache === null) {
    layoutSnapshotCache = JSON.stringify(readLayoutsFromStorage())
  }
  return layoutSnapshotCache
}

export function useDashboardLayouts(): ResponsiveLayouts {
  const json = useSyncExternalStore(
    subscribeDashboardLayouts,
    snapshotDashboardLayouts,
    () => JSON.stringify(buildDefaultDashboardLayouts([...DASHBOARD_TILE_IDS])),
  )
  return JSON.parse(json) as ResponsiveLayouts
}

export function persistDashboardLayouts(layouts: ResponsiveLayouts): void {
  saveDashboardLayouts(sanitizeLayouts(layouts))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED))
}
