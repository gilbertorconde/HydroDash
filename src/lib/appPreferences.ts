import { useSyncExternalStore } from 'react'

/**
 * Client-only preferences (OpenSprinkler App "App Settings" section).
 * Keys mirror the OG Cordova app localStorage usage for familiarity.
 */
const CHANGED = 'os-app-prefs-changed'

const KEYS = {
  isMetric: 'os_app_isMetric',
  is24Hour: 'os_app_is24Hour',
  groupView: 'os_app_groupView',
  sortByStationName: 'os_app_sortByStationName',
  showDisabled: 'showDisabled',
  showStationNum: 'showStationNum',
} as const

function readBool(key: string, defaultValue: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return defaultValue
    return v === 'true'
  } catch {
    return defaultValue
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

export type AppPreferences = {
  isMetric: boolean
  is24Hour: boolean
  groupView: boolean
  sortByStationName: boolean
  showDisabled: boolean
  showStationNum: boolean
}

const defaultMetric =
  typeof navigator !== 'undefined' &&
  !['US', 'BM', 'PW'].includes((navigator.languages?.[0] ?? 'en').split('-')[1]?.toUpperCase() ?? '')

export function loadAppPreferences(): AppPreferences {
  return {
    isMetric: readBool(KEYS.isMetric, defaultMetric),
    is24Hour: readBool(KEYS.is24Hour, false),
    groupView: readBool(KEYS.groupView, false),
    sortByStationName: readBool(KEYS.sortByStationName, false),
    showDisabled: readBool(KEYS.showDisabled, false),
    showStationNum: readBool(KEYS.showStationNum, false),
  }
}

export function saveAppPreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) {
  const k = KEYS[key]
  writeBool(k, value as boolean)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED))
}

function subscribeAppPreferences(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const fn = () => cb()
  window.addEventListener(CHANGED, fn)
  return () => window.removeEventListener(CHANGED, fn)
}

/** Stable snapshot for useSyncExternalStore (must not return a fresh object each call). */
function appPreferencesSnapshot(): string {
  return JSON.stringify(loadAppPreferences())
}

/**
 * Re-renders when preferences change on this tab (Settings saves dispatch an event).
 * Snapshot is a JSON string so React can compare consecutive reads with Object.is.
 */
export function useAppPreferences(): AppPreferences {
  const json = useSyncExternalStore(
    subscribeAppPreferences,
    appPreferencesSnapshot,
    appPreferencesSnapshot,
  )
  return JSON.parse(json) as AppPreferences
}
