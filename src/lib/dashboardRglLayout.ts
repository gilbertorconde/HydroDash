import { useSyncExternalStore } from 'react'
import { cloneLayout, verticalCompactor } from 'react-grid-layout'
import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout'
import {
  DASHBOARD_TILE_IDS,
  type DashboardTileId,
  loadDashboardTileOrder,
} from './dashboardTileOrder'

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
  xs: 4,
  /** 4 cols (not 2): with 2 cols every tile was full-width / one per row on narrow viewports. */
  xxs: 4,
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
    const clamped = clampLayoutToCols(out[k], n)
    out[k] = verticalCompactor.compact(cloneLayout(clamped), n)
  }
  return out
}

/** Grid row units per tile (history is taller). */
const TILE_H_UNITS: Record<DashboardTileId, number> = {
  controller: 7,
  live: 11,
  sensors: 9,
  history: 13,
  quickrun: 12,
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

function isValidLayout(arr: unknown, cols: number): arr is Layout {
  if (!Array.isArray(arr) || arr.length !== DASHBOARD_TILE_IDS.length) return false
  const ids = new Set<string>()
  for (const el of arr) {
    if (!isLayoutItem(el)) return false
    if (!DASHBOARD_TILE_IDS.includes(el.i as DashboardTileId)) return false
    if (ids.has(el.i)) return false
    ids.add(el.i)
  }
  if (ids.size !== DASHBOARD_TILE_IDS.length) return false
  // Reject when every tile spans the full column width — this is a corrupted "one-per-row" layout.
  if (cols > 1 && (arr as LayoutItem[]).every((l) => l.w >= cols)) return false
  return true
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
  const h = (id: DashboardTileId) => TILE_H_UNITS[id]
  return {
    lg: placeRowMajor(order, 12, 4, h),
    md: placeRowMajor(order, 12, 3, h),
    sm: placeRowMajor(order, 6, 2, h),
    xs: placeRowMajor(order, 4, 2, h),
    xxs: placeRowMajor(order, 4, 2, h),
  }
}

function parseLayouts(raw: unknown): ResponsiveLayouts | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const keys = ['lg', 'md', 'sm', 'xs', 'xxs'] as const
  for (const k of keys) {
    if (!isValidLayout(o[k], DASHBOARD_RGL_COLS[k])) return null
  }
  return o as ResponsiveLayouts
}

function readLayoutsFromStorage(): ResponsiveLayouts {
  if (typeof window === 'undefined') {
    return buildDefaultDashboardLayouts([...DASHBOARD_TILE_IDS])
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = parseLayouts(JSON.parse(stored) as unknown)
      if (parsed) {
        const sanitized = sanitizeLayouts(parsed)
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
    }
  } catch {
    /* ignore */
  }
  const order = loadDashboardTileOrder()
  const layouts = buildDefaultDashboardLayouts(order)
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
  return () => {
    window.removeEventListener(CHANGED, fn)
    window.removeEventListener('storage', fn)
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
