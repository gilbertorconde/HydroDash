import { useMemo, useSyncExternalStore } from 'react'

/**
 * Home card registry + persisted order / visibility ("Customize Home").
 *
 * The "Now running" experience lives in the page hero; everything below it is a curated,
 * responsive grid of cards. Users can show/hide and reorder cards; there is no free-form
 * drag/resize grid any more.
 *
 * Storage keys and change events are the same ones the old react-grid-layout dashboard used, so
 * app backup/restore (`hydroDashAppBackup.ts`) keeps working. Saves made by the old dashboard
 * (tile ids `running`, `live`, `sensors`, `quickrun`) are migrated on read via `LEGACY_IDS`.
 * The old grid-position (`hydrodash.dashboardRglLayouts.2`) and max-height keys are no longer
 * read; "Reset" clears them so stale data does not linger in backups.
 */

export const HOME_CARD_IDS = [
  'upnext',
  'conditions',
  'programs',
  'raindelay',
  'history',
  'controller',
] as const
export type HomeCardId = (typeof HOME_CARD_IDS)[number]

export const HOME_CARD_TITLES: Record<HomeCardId, string> = {
  upnext: 'Up next',
  conditions: 'Conditions',
  programs: 'Programs',
  raindelay: 'Rain delay',
  history: 'Recent activity',
  controller: 'Controller',
}

/** Cards that span two columns on the 3-column desktop grid. */
export const HOME_WIDE_CARDS: ReadonlySet<HomeCardId> = new Set(['upnext', 'programs', 'history'])

/** Old dashboard tile ids → the card that now shows that content. */
const LEGACY_IDS: Record<string, HomeCardId> = {
  running: 'upnext',
  live: 'raindelay',
  sensors: 'conditions',
  quickrun: 'programs',
}

const ORDER_KEY = 'hydrodash.dashboardTileOrder'
const ORDER_CHANGED = 'hydrodash-dashboard-tiles-changed'
const VIS_KEY = 'hydrodash.dashboardTileVisibility'
const VIS_CHANGED = 'hydrodash-dashboard-tile-visibility-changed'
const LEGACY_LAYOUTS_KEY = 'hydrodash.dashboardRglLayouts.2'
const LEGACY_MAX_H_KEY = 'hydrodash.dashboardTileMaxHeight'

function toCardId(x: unknown): HomeCardId | null {
  if (typeof x !== 'string') return null
  if ((HOME_CARD_IDS as readonly string[]).includes(x)) return x as HomeCardId
  return LEGACY_IDS[x] ?? null
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

function subscribeTo(event: string) {
  return (cb: () => void) => {
    if (typeof window === 'undefined') return () => {}
    window.addEventListener(event, cb)
    window.addEventListener('storage', cb)
    return () => {
      window.removeEventListener(event, cb)
      window.removeEventListener('storage', cb)
    }
  }
}

/* ---------- Order ---------- */

/** Saved order (legacy ids mapped, unknown dropped); cards missing from the save go last. */
export function loadHomeCardOrder(): HomeCardId[] {
  const parsed = readJson(ORDER_KEY)
  const out: HomeCardId[] = []
  if (Array.isArray(parsed)) {
    for (const raw of parsed) {
      const id = toCardId(raw)
      if (id && !out.includes(id)) out.push(id)
    }
  }
  for (const id of HOME_CARD_IDS) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

const subscribeOrder = subscribeTo(ORDER_CHANGED)

export function useHomeCardOrder(): HomeCardId[] {
  const json = useSyncExternalStore(
    subscribeOrder,
    () => JSON.stringify(loadHomeCardOrder()),
    () => JSON.stringify([...HOME_CARD_IDS]),
  )
  return useMemo(() => JSON.parse(json) as HomeCardId[], [json])
}

/** Swap a card with its neighbour (`dir` -1 = up, 1 = down) and persist. */
export function moveHomeCard(order: readonly HomeCardId[], id: HomeCardId, dir: -1 | 1): void {
  const i = order.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return
  const next = [...order]
  ;[next[i], next[j]] = [next[j], next[i]]
  writeJson(ORDER_KEY, next, ORDER_CHANGED)
}

/* ---------- Visibility ---------- */

export type HomeCardVisibility = Record<HomeCardId, boolean>

function defaultVisibility(): HomeCardVisibility {
  const out = {} as HomeCardVisibility
  for (const id of HOME_CARD_IDS) out[id] = true
  return out
}

export function loadHomeCardVisibility(): HomeCardVisibility {
  const out = defaultVisibility()
  const parsed = readJson(VIS_KEY)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out
  const o = parsed as Record<string, unknown>
  // Legacy ids first so a value saved under the new id wins.
  for (const [legacy, id] of Object.entries(LEGACY_IDS)) {
    if (legacy in o) out[id] = Boolean(o[legacy])
  }
  for (const id of HOME_CARD_IDS) {
    if (id in o) out[id] = Boolean(o[id])
  }
  return out
}

const subscribeVisibility = subscribeTo(VIS_CHANGED)

export function useHomeCardVisibility(): HomeCardVisibility {
  const json = useSyncExternalStore(
    subscribeVisibility,
    () => JSON.stringify(loadHomeCardVisibility()),
    () => JSON.stringify(defaultVisibility()),
  )
  return useMemo(() => JSON.parse(json) as HomeCardVisibility, [json])
}

/** Show or hide one card and persist. (All cards may be hidden: the hero always stays.) */
export function setHomeCardVisible(prev: HomeCardVisibility, id: HomeCardId, visible: boolean): void {
  writeJson(VIS_KEY, { ...prev, [id]: visible }, VIS_CHANGED)
}

export function visibleHomeCardIds(
  visibility: HomeCardVisibility,
  order: readonly HomeCardId[],
): HomeCardId[] {
  return order.filter((id) => visibility[id])
}

/** Default order, every card visible; also drops the old grid-layout keys. */
export function resetHomeCards(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(LEGACY_LAYOUTS_KEY)
      localStorage.removeItem(LEGACY_MAX_H_KEY)
    } catch {
      /* ignore */
    }
  }
  writeJson(ORDER_KEY, [...HOME_CARD_IDS], ORDER_CHANGED)
  writeJson(VIS_KEY, defaultVisibility(), VIS_CHANGED)
}
