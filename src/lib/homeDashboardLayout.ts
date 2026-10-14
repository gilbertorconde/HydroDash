import { useMemo, useSyncExternalStore } from 'react'
import { cloneLayout, verticalCompactor } from 'react-grid-layout'
import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout'

/**
 * Home dashboard tile registry + persisted order / visibility / grid positions.
 *
 * Supersedes `dashboardTileOrder.ts`, `dashboardTileVisibility.ts` and `dashboardRglLayout.ts`
 * for the Home page (adds the `running` tile). Storage keys and change events are unchanged so
 * app backup/restore (`hydroDashAppBackup.ts`) keeps working and existing saves migrate in place:
 * a saved order / layout without `running` gets it inserted at the top.
 *
 * Grid units: the Home grid uses `rowHeight: 1` and no vertical margin, so `y`/`h` are pixels.
 * Heights are measured from tile content at runtime; only `x`/`y`/`w` are meaningful in storage.
 */

export const HOME_TILE_IDS = [
  'running',
  'controller',
  'live',
  'sensors',
  'history',
  'quickrun',
] as const
export type HomeTileId = (typeof HOME_TILE_IDS)[number]

const ORDER_KEY = 'hydrodash.dashboardTileOrder'
const ORDER_CHANGED = 'hydrodash-dashboard-tiles-changed'
const VIS_KEY = 'hydrodash.dashboardTileVisibility'
const VIS_CHANGED = 'hydrodash-dashboard-tile-visibility-changed'
const LAYOUTS_KEY = 'hydrodash.dashboardRglLayouts.2'
const LAYOUTS_CHANGED = 'hydrodash-dashboard-rgl-changed'
const MAX_H_KEY = 'hydrodash.dashboardTileMaxHeight'
const MAX_H_CHANGED = 'hydrodash-dashboard-tile-max-height-changed'

const BREAKPOINT_KEYS = ['lg', 'md', 'sm', 'xs', 'xxs'] as const
type BreakpointKey = (typeof BREAKPOINT_KEYS)[number]

export const HOME_RGL_BREAKPOINTS = {
  lg: 1280,
  md: 960,
  sm: 640,
  xs: 480,
  xxs: 0,
} as const

export const HOME_RGL_COLS: Record<BreakpointKey, number> = {
  lg: 12,
  md: 12,
  sm: 6,
  /** Narrow viewports: one grid column so each card is full width (one per row). */
  xs: 1,
  xxs: 1,
}

/** Vertical gap between tiles (px); rendered as padding inside each grid item. */
export const HOME_TILE_GAP_PX = 16

/** Height used before a tile's content has been measured (first frame only). */
export const HOME_TILE_FALLBACK_PX: Record<HomeTileId, number> = {
  running: 160,
  controller: 220,
  live: 300,
  sensors: 300,
  history: 420,
  quickrun: 320,
}

/** Bounds for the optional per-tile max height (desktop grid only). */
export const HOME_TILE_MAX_H_BOUNDS = { min: 120, max: 2000 } as const

function isHomeTileId(x: unknown): x is HomeTileId {
  return typeof x === 'string' && (HOME_TILE_IDS as readonly string[]).includes(x)
}

function readJson(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown, event: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new Event(event))
}

function subscribeTo(events: string[]) {
  return (cb: () => void) => {
    if (typeof window === 'undefined') return () => {}
    for (const e of events) window.addEventListener(e, cb)
    window.addEventListener('storage', cb)
    return () => {
      for (const e of events) window.removeEventListener(e, cb)
      window.removeEventListener('storage', cb)
    }
  }
}

/* ---------- Order ---------- */

/** Saved order with unknown ids dropped; `running` (new) goes first, other missing ids last. */
export function loadHomeTileOrder(): HomeTileId[] {
  const parsed = readJson(ORDER_KEY)
  if (!Array.isArray(parsed)) return [...HOME_TILE_IDS]
  const out: HomeTileId[] = []
  for (const id of parsed) {
    if (isHomeTileId(id) && !out.includes(id)) out.push(id)
  }
  if (!out.includes('running')) out.unshift('running')
  for (const id of HOME_TILE_IDS) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

const subscribeOrder = subscribeTo([ORDER_CHANGED])

export function useHomeTileOrder(): HomeTileId[] {
  const json = useSyncExternalStore(
    subscribeOrder,
    () => JSON.stringify(loadHomeTileOrder()),
    () => JSON.stringify([...HOME_TILE_IDS]),
  )
  return useMemo(() => JSON.parse(json) as HomeTileId[], [json])
}

/* ---------- Visibility ---------- */

export type HomeTileVisibility = Record<HomeTileId, boolean>

function defaultVisibility(): HomeTileVisibility {
  const out = {} as HomeTileVisibility
  for (const id of HOME_TILE_IDS) out[id] = true
  return out
}

export function loadHomeTileVisibility(): HomeTileVisibility {
  const out = defaultVisibility()
  const parsed = readJson(VIS_KEY)
  if (!parsed || typeof parsed !== 'object') return out
  const o = parsed as Record<string, unknown>
  for (const id of HOME_TILE_IDS) {
    if (id in o) out[id] = Boolean(o[id])
  }
  if (!HOME_TILE_IDS.some((id) => out[id])) out.running = true
  return out
}

const subscribeVisibility = subscribeTo([VIS_CHANGED])

export function useHomeTileVisibility(): HomeTileVisibility {
  const json = useSyncExternalStore(
    subscribeVisibility,
    () => JSON.stringify(loadHomeTileVisibility()),
    () => JSON.stringify(defaultVisibility()),
  )
  return useMemo(() => JSON.parse(json) as HomeTileVisibility, [json])
}

/** Toggle one tile and persist; refuses (returns false) to hide the last visible tile. */
export function toggleHomeTileVisibility(
  prev: HomeTileVisibility,
  id: HomeTileId,
  enabled: boolean,
): boolean {
  const next = { ...prev, [id]: enabled }
  if (!HOME_TILE_IDS.some((i) => next[i])) return false
  writeJson(VIS_KEY, next, VIS_CHANGED)
  return true
}

export function visibleHomeTileIds(
  visibility: HomeTileVisibility,
  order: readonly HomeTileId[],
): HomeTileId[] {
  return order.filter((id) => visibility[id])
}

/* ---------- Per-tile max height (desktop grid) ---------- */

export type HomeTileMaxHeights = Partial<Record<HomeTileId, number>>

export function loadHomeTileMaxHeights(): HomeTileMaxHeights {
  const parsed = readJson(MAX_H_KEY)
  const out: HomeTileMaxHeights = {}
  if (!parsed || typeof parsed !== 'object') return out
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (isHomeTileId(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v
  }
  return out
}

const subscribeMaxHeights = subscribeTo([MAX_H_CHANGED])

export function useHomeTileMaxHeights(): HomeTileMaxHeights {
  const json = useSyncExternalStore(
    subscribeMaxHeights,
    () => JSON.stringify(loadHomeTileMaxHeights()),
    () => '{}',
  )
  return useMemo(() => JSON.parse(json) as HomeTileMaxHeights, [json])
}

/** `null` clears the cap (tile sizes to its content). */
export function persistHomeTileMaxHeight(id: HomeTileId, px: number | null): void {
  const next = loadHomeTileMaxHeights()
  if (px == null) delete next[id]
  else {
    const { min, max } = HOME_TILE_MAX_H_BOUNDS
    next[id] = Math.max(min, Math.min(max, Math.round(px)))
  }
  writeJson(MAX_H_KEY, next, MAX_H_CHANGED)
}

/** Drop every stored cap (used by "Reset layout"). */
export function clearHomeTileMaxHeights(): void {
  writeJson(MAX_H_KEY, {}, MAX_H_CHANGED)
}

/* ---------- Grid positions ---------- */

function tilesPerRow(bp: BreakpointKey): number {
  return bp === 'lg' ? 4 : bp === 'md' ? 3 : bp === 'sm' ? 2 : 1
}

/** Default width (cols): "Now running" spans two regular tiles on wide grids. */
function defaultTileWidth(id: HomeTileId, bp: BreakpointKey): number {
  const cols = HOME_RGL_COLS[bp]
  const w = Math.max(1, Math.floor(cols / tilesPerRow(bp)))
  return id === 'running' && cols > 1 ? Math.min(cols, w * 2) : w
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

function clampToCols(layout: Layout, cols: number): LayoutItem[] {
  return layout.map((item) => {
    const w = Math.max(1, Math.min(item.w, cols))
    const x = Math.min(Math.max(0, item.x), Math.max(0, cols - w))
    return { ...item, x, y: Math.max(0, item.y), w, h: Math.max(1, item.h) }
  })
}

function placeRowMajor(order: readonly HomeTileId[], bp: BreakpointKey): LayoutItem[] {
  const cols = HOME_RGL_COLS[bp]
  const out: LayoutItem[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const id of order) {
    const w = defaultTileWidth(id, bp)
    const h = HOME_TILE_FALLBACK_PX[id]
    if (x + w > cols) {
      y += rowH
      x = 0
      rowH = 0
    }
    out.push({ i: id, x, y, w, h })
    rowH = Math.max(rowH, h)
    x += w
  }
  return out
}

export function buildDefaultHomeLayouts(order: readonly HomeTileId[]): ResponsiveLayouts {
  const out: ResponsiveLayouts = {}
  for (const bp of BREAKPOINT_KEYS) out[bp] = placeRowMajor(order, bp)
  return out
}

/**
 * Reconcile one stored breakpoint with the full tile registry. Every tile id gets an item
 * (hidden ones too, so re-showing a tile restores its spot). Missing `running` is inserted at
 * the top-left, pushing the rest down; other missing ids are appended at the bottom.
 */
function normalizeBreakpoint(raw: unknown, bp: BreakpointKey, order: readonly HomeTileId[]): Layout {
  const cols = HOME_RGL_COLS[bp]
  const arr = Array.isArray(raw) ? raw.filter(isLayoutItem) : []
  const byId = new Map<string, LayoutItem>()
  for (const it of arr) {
    if (isHomeTileId(it.i) && !byId.has(it.i)) byId.set(it.i, { i: it.i, x: it.x, y: it.y, w: it.w, h: it.h })
  }
  let items = [...byId.values()]
  if (!byId.has('running')) {
    const h = HOME_TILE_FALLBACK_PX.running
    items = items.map((it) => ({ ...it, y: it.y + h }))
    items.unshift({ i: 'running', x: 0, y: 0, w: defaultTileWidth('running', bp), h })
  }
  for (const id of order) {
    if (items.some((it) => it.i === id)) continue
    const bottom = items.reduce((m, it) => Math.max(m, it.y + it.h), 0)
    items.push({ i: id, x: 0, y: bottom, w: defaultTileWidth(id, bp), h: HOME_TILE_FALLBACK_PX[id] })
  }
  return verticalCompactor.compact(cloneLayout(clampToCols(items, cols)), cols)
}

function loadHomeLayouts(): ResponsiveLayouts {
  const order = loadHomeTileOrder()
  const parsed = readJson(LAYOUTS_KEY)
  if (!parsed || typeof parsed !== 'object') return buildDefaultHomeLayouts(order)
  const stored = parsed as Record<string, unknown>
  const defaults = buildDefaultHomeLayouts(order)
  const out: ResponsiveLayouts = {}
  for (const bp of BREAKPOINT_KEYS) {
    out[bp] = bp in stored ? normalizeBreakpoint(stored[bp], bp, order) : defaults[bp]
  }
  return out
}

const subscribeLayouts = subscribeTo([LAYOUTS_CHANGED, ORDER_CHANGED])

/** `getSnapshot` runs on every render; only re-normalize when the raw stored strings change. */
let layoutsCache: { rawLayouts: string | null; rawOrder: string | null; json: string } | null = null

function snapshotHomeLayouts(): string {
  let rawLayouts: string | null = null
  let rawOrder: string | null = null
  try {
    rawLayouts = localStorage.getItem(LAYOUTS_KEY)
    rawOrder = localStorage.getItem(ORDER_KEY)
  } catch {
    /* ignore */
  }
  if (layoutsCache && layoutsCache.rawLayouts === rawLayouts && layoutsCache.rawOrder === rawOrder) {
    return layoutsCache.json
  }
  const json = JSON.stringify(loadHomeLayouts())
  layoutsCache = { rawLayouts, rawOrder, json }
  return json
}

export function useHomeLayouts(): ResponsiveLayouts {
  const json = useSyncExternalStore(
    subscribeLayouts,
    snapshotHomeLayouts,
    () => JSON.stringify(buildDefaultHomeLayouts(HOME_TILE_IDS)),
  )
  return useMemo(() => JSON.parse(json) as ResponsiveLayouts, [json])
}

/**
 * Save positions for one breakpoint after a drag. Items for tiles not in `layout` (hidden)
 * keep their previous stored position.
 */
export function persistHomeBreakpointLayout(
  current: ResponsiveLayouts,
  bp: string,
  layout: Layout,
): void {
  if (!(BREAKPOINT_KEYS as readonly string[]).includes(bp)) return
  const key = bp as BreakpointKey
  const ids = new Set(layout.map((it) => it.i))
  const kept = (current[key] ?? []).filter((it) => !ids.has(it.i))
  const merged = [
    ...layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
    ...kept.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
  ]
  writeJson(
    LAYOUTS_KEY,
    { ...current, [key]: clampToCols(merged, HOME_RGL_COLS[key]) },
    LAYOUTS_CHANGED,
  )
}

export function resetHomeLayouts(order: readonly HomeTileId[]): void {
  writeJson(LAYOUTS_KEY, buildDefaultHomeLayouts(order), LAYOUTS_CHANGED)
}
