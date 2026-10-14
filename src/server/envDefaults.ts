/**
 * Node-only defaults when optional env vars are unset.
 * Docker Compose does not supply fallbacks for these; see docs/environment.md.
 */

export const DEFAULT_NOTIFICATIONS_POLL_INTERVAL_SEC = 45
export const DEFAULT_NOTIFICATIONS_RETENTION_DAYS = 90
export const DEFAULT_NOTIFICATIONS_HEALTH_PORT = 8081
export const DEFAULT_NOTIFICATIONS_FETCH_TIMEOUT_SEC = 10
export const DEFAULT_NOTIFICATIONS_OFFLINE_ALERT_MIN = 10

export function getNotificationsPollIntervalSec(): number {
  const raw = process.env.NOTIFICATIONS_POLL_INTERVAL_SEC
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_NOTIFICATIONS_POLL_INTERVAL_SEC
  const n = Number(raw)
  return Math.max(5, Number.isFinite(n) ? n : DEFAULT_NOTIFICATIONS_POLL_INTERVAL_SEC)
}

export function getNotificationsRetentionDays(): number {
  const raw = process.env.NOTIFICATIONS_RETENTION_DAYS
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_NOTIFICATIONS_RETENTION_DAYS
  const n = Number(raw)
  return Math.max(7, Number.isFinite(n) ? n : DEFAULT_NOTIFICATIONS_RETENTION_DAYS)
}

export function getNotificationsFetchTimeoutSec(): number {
  const raw = process.env.NOTIFICATIONS_FETCH_TIMEOUT_SEC
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_NOTIFICATIONS_FETCH_TIMEOUT_SEC
  const n = Number(raw)
  return Math.max(2, Number.isFinite(n) ? n : DEFAULT_NOTIFICATIONS_FETCH_TIMEOUT_SEC)
}

/** Minutes without a successful poll before alerting; also the age after which a snapshot is too stale to diff. */
export function getNotificationsOfflineAlertMin(): number {
  const raw = process.env.NOTIFICATIONS_OFFLINE_ALERT_MIN
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_NOTIFICATIONS_OFFLINE_ALERT_MIN
  const n = Number(raw)
  return Math.max(1, Number.isFinite(n) ? n : DEFAULT_NOTIFICATIONS_OFFLINE_ALERT_MIN)
}

export function getNotificationsHealthPort(): number {
  const raw = process.env.NOTIFICATIONS_HEALTH_PORT
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_NOTIFICATIONS_HEALTH_PORT
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 && n <= 65535
    ? n
    : DEFAULT_NOTIFICATIONS_HEALTH_PORT
}

export function isNotificationsHealthDisabled(): boolean {
  return process.env.NOTIFICATIONS_HEALTH_DISABLE === '1'
}

export function isNotificationsWorkerEnabled(): boolean {
  return process.env.NOTIFICATIONS_ENABLED !== '0'
}
