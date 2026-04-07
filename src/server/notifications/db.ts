import mysql from 'mysql2/promise'
import type { ResultSetHeader } from 'mysql2'
import type { NotificationSettingsJson } from './types'
import { defaultSettingsJson, mergeNotificationSettings } from './types'
import { applyNotificationsSchema } from './schema'

let pool: mysql.Pool | null = null

let schemaEnsurePromise: Promise<void> | null = null

/** Ensures notification tables exist (uses DATABASE_SCHEMA_URL or DATABASE_URL). No-op if DATABASE_URL unset. */
export async function ensureNotificationsSchemaReady(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) return
  if (!schemaEnsurePromise) {
    schemaEnsurePromise = applyNotificationsSchema().catch((e) => {
      schemaEnsurePromise = null
      throw e
    })
  }
  await schemaEnsurePromise
}

export function getNotificationsDbPool(): mysql.Pool | null {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) return null
  if (!pool) {
    pool = mysql.createPool(url)
  }
  return pool
}

export function notificationsFeatureEnabled(): boolean {
  return !!process.env.DATABASE_URL?.trim()
}

export function ntfyPushConfigured(): boolean {
  return !!process.env.NTFY_SERVER_URL?.trim()
}

export async function loadNotificationSettings(pool: mysql.Pool): Promise<NotificationSettingsJson> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT settings_json FROM notification_settings WHERE id = 1 LIMIT 1',
  )
  const row = rows[0]
  if (!row?.settings_json) return defaultSettingsJson()
  const raw =
    typeof row.settings_json === 'string' ? (JSON.parse(row.settings_json) as unknown) : row.settings_json
  return mergeNotificationSettings(raw as Partial<NotificationSettingsJson>)
}

export async function saveNotificationSettings(pool: mysql.Pool, settings: NotificationSettingsJson): Promise<void> {
  const json = JSON.stringify(settings)
  await pool.execute(
    `INSERT INTO notification_settings (id, settings_json) VALUES (1, ?)
     ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_at = CURRENT_TIMESTAMP`,
    [json],
  )
}

export async function insertNotificationEvent(
  pool: mysql.Pool,
  input: {
    siteId: string | null
    serviceKey: string
    title: string
    body: string
    route: string
    ntfyOk: boolean
    payload?: unknown
  },
): Promise<number> {
  const payloadJson = input.payload !== undefined ? JSON.stringify(input.payload) : null
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notification_events
     (site_id, service_key, title, body, route, ntfy_ok, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.siteId,
      input.serviceKey,
      input.title,
      input.body,
      input.route,
      input.ntfyOk ? 1 : 0,
      payloadJson,
    ],
  )
  return Number(result.insertId)
}

export async function updateNotificationEventNtfyMeta(
  pool: mysql.Pool,
  id: number,
  input: { ntfyOk: boolean; ntfyTopic: string | null; ntfySequenceId: string | null },
): Promise<void> {
  await pool.execute(
    `UPDATE notification_events
     SET ntfy_ok = ?, ntfy_topic = ?, ntfy_sequence_id = ?
     WHERE id = ?`,
    [input.ntfyOk ? 1 : 0, input.ntfyTopic, input.ntfySequenceId, id],
  )
}

export type NtfyClearTarget = { topic: string; sequenceId: string }

/** Unread rows that were successfully pushed to ntfy with a sequence id (for PUT …/clear). */
export async function listUnreadNtfyClearTargets(pool: mysql.Pool): Promise<NtfyClearTarget[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT ntfy_topic, ntfy_sequence_id FROM notification_events
     WHERE read_at IS NULL AND ntfy_ok = 1
       AND ntfy_topic IS NOT NULL AND TRIM(ntfy_topic) != ''
       AND ntfy_sequence_id IS NOT NULL AND TRIM(ntfy_sequence_id) != ''`,
  )
  return rows.map((r) => ({
    topic: String(r.ntfy_topic).trim(),
    sequenceId: String(r.ntfy_sequence_id).trim(),
  }))
}

export async function listNotificationEvents(
  pool: mysql.Pool,
  limit: number,
): Promise<
  {
    id: bigint
    created_at: Date
    site_id: string | null
    service_key: string
    title: string
    body: string
    route: string
    read_at: Date | null
  }[]
> {
  const lim = Math.min(Math.max(1, limit), 200)
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT id, created_at, site_id, service_key, title, body, route, read_at
     FROM notification_events
     ORDER BY created_at DESC
     LIMIT ?`,
    [lim],
  )
  return rows as {
    id: bigint
    created_at: Date
    site_id: string | null
    service_key: string
    title: string
    body: string
    route: string
    read_at: Date | null
  }[]
}

export async function countUnreadNotifications(pool: mysql.Pool): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT COUNT(*) AS c FROM notification_events WHERE read_at IS NULL',
  )
  const c = rows[0]?.c
  return typeof c === 'bigint' ? Number(c) : Number(c) || 0
}

export async function markAllNotificationsRead(pool: mysql.Pool): Promise<void> {
  await pool.execute('UPDATE notification_events SET read_at = CURRENT_TIMESTAMP WHERE read_at IS NULL')
}

export async function loadPollerSnapshot(pool: mysql.Pool, siteId: string): Promise<string | null> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT snapshot_json FROM notification_poller_state WHERE site_id = ? LIMIT 1',
    [siteId],
  )
  const s = rows[0]?.snapshot_json
  return typeof s === 'string' ? s : null
}

export async function savePollerSnapshot(pool: mysql.Pool, siteId: string, snapshotJson: string): Promise<void> {
  await pool.execute(
    `INSERT INTO notification_poller_state (site_id, snapshot_json) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE snapshot_json = VALUES(snapshot_json), updated_at = CURRENT_TIMESTAMP`,
    [siteId, snapshotJson],
  )
}

export async function pruneOldNotificationEvents(pool: mysql.Pool, days: number): Promise<void> {
  const d = Math.max(1, Math.min(days, 3650))
  await pool.execute('DELETE FROM notification_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [d])
}
