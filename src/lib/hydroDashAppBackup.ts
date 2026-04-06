import type { AppPreferences } from './appPreferences'

/** Bump when the app backup shape changes. */
export const HYDRODASH_APP_BACKUP_VERSION = 1

export type HydroDashAppBackupV1 = {
  version: typeof HYDRODASH_APP_BACKUP_VERSION
  exportedAt: string
  preferences: AppPreferences
  theme: 'light' | 'dark' | 'system' | null
  /** Raw localStorage values (opaque JSON strings). */
  dashboardLayouts: string | null
  dashboardTileVisibility: string | null
  dashboardTileOrder: string | null
}

const THEME_KEY = 'hydrodash-theme'
const LAYOUTS_KEY = 'hydrodash.dashboardRglLayouts.2'
const VIS_KEY = 'hydrodash.dashboardTileVisibility'
const ORDER_KEY = 'hydrodash.dashboardTileOrder'

const PREF_KEYS: Record<keyof AppPreferences, string> = {
  isMetric: 'os_app_isMetric',
  is24Hour: 'os_app_is24Hour',
  groupView: 'os_app_groupView',
  sortByStationName: 'os_app_sortByStationName',
  showDisabled: 'showDisabled',
  showStationNum: 'showStationNum',
}

const EVT_PREFS = 'os-app-prefs-changed'
const EVT_RGL = 'hydrodash-dashboard-rgl-changed'
const EVT_VIS = 'hydrodash-dashboard-tile-visibility-changed'
const EVT_ORDER = 'hydrodash-dashboard-tiles-changed'

function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function collectHydroDashAppBackup(preferences: AppPreferences): HydroDashAppBackupV1 {
  const themeRaw = safeGet(THEME_KEY)
  const theme =
    themeRaw === 'light' || themeRaw === 'dark' || themeRaw === 'system' ? themeRaw : null

  return {
    version: HYDRODASH_APP_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    preferences: { ...preferences },
    theme,
    dashboardLayouts: safeGet(LAYOUTS_KEY),
    dashboardTileVisibility: safeGet(VIS_KEY),
    dashboardTileOrder: safeGet(ORDER_KEY),
  }
}

export function parseHydroDashAppBackup(raw: unknown): HydroDashAppBackupV1 {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid JSON')
  const o = raw as Record<string, unknown>
  if (o.hydrodashApp && typeof o.hydrodashApp === 'object') {
    return parseHydroDashAppBackup(o.hydrodashApp)
  }
  if (o.version !== HYDRODASH_APP_BACKUP_VERSION) {
    throw new Error('Unsupported HydroDash app backup version')
  }
  const p = o.preferences
  if (!p || typeof p !== 'object') throw new Error('Missing preferences object')

  const prefs = p as Record<string, unknown>
  const readBool = (k: keyof AppPreferences) => prefs[k] === true

  return {
    version: HYDRODASH_APP_BACKUP_VERSION,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
    preferences: {
      isMetric: readBool('isMetric'),
      is24Hour: readBool('is24Hour'),
      groupView: readBool('groupView'),
      sortByStationName: readBool('sortByStationName'),
      showDisabled: readBool('showDisabled'),
      showStationNum: readBool('showStationNum'),
    },
    theme:
      o.theme === 'light' || o.theme === 'dark' || o.theme === 'system'
        ? o.theme
        : o.theme === null
          ? null
          : null,
    dashboardLayouts: typeof o.dashboardLayouts === 'string' ? o.dashboardLayouts : null,
    dashboardTileVisibility:
      typeof o.dashboardTileVisibility === 'string' ? o.dashboardTileVisibility : null,
    dashboardTileOrder: typeof o.dashboardTileOrder === 'string' ? o.dashboardTileOrder : null,
  }
}

/** Writes localStorage and dispatches the same events the dashboard / prefs use. */
export function applyHydroDashAppBackup(data: HydroDashAppBackupV1) {
  if (typeof window === 'undefined') return

  for (const [prefKey, storageKey] of Object.entries(PREF_KEYS) as [keyof AppPreferences, string][]) {
    safeSet(storageKey, data.preferences[prefKey] ? 'true' : 'false')
  }
  window.dispatchEvent(new Event(EVT_PREFS))

  if (data.theme) {
    safeSet(THEME_KEY, data.theme)
  }

  safeSet(LAYOUTS_KEY, data.dashboardLayouts)
  window.dispatchEvent(new Event(EVT_RGL))

  safeSet(VIS_KEY, data.dashboardTileVisibility)
  window.dispatchEvent(new Event(EVT_VIS))

  safeSet(ORDER_KEY, data.dashboardTileOrder)
  window.dispatchEvent(new Event(EVT_ORDER))
}
