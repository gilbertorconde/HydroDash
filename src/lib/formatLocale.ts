/** Locale-aware timestamps; `hour12` from app prefs (Settings → 24-hour time). */
export function formatEpochSecondsLocale(epochSec: number, opts?: { hour12?: boolean }): string {
  const d = new Date(epochSec * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    hour12: opts?.hour12 ?? true,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Time-of-day with seconds (for log tables). */
export function formatEpochTimeHmsLocale(epochSec: number, opts?: { hour12?: boolean }): string {
  const d = new Date(epochSec * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(undefined, {
    hour12: opts?.hour12 ?? true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Wall-clock from minutes 0–1439. */
export function formatMinutesWall(mins: number, is24Hour: boolean): string {
  const m = Math.max(0, Math.min(1439, Math.floor(mins)))
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (is24Hour) {
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`
}
