import mysql from 'mysql2/promise'
import { defaultSettingsJson } from './types'

/**
 * Applies notification tables + default settings row if missing.
 * Uses DATABASE_SCHEMA_URL when set (e.g. root for Docker bootstrap); otherwise DATABASE_URL.
 * Safe to call repeatedly (idempotent).
 */
export async function applyNotificationsSchema(): Promise<void> {
  const appUrl = process.env.DATABASE_URL?.trim()
  if (!appUrl) return

  const schemaUrl = process.env.DATABASE_SCHEMA_URL?.trim() || appUrl
  const conn = await mysql.createConnection(schemaUrl)
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id INT PRIMARY KEY,
        settings_json JSON NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `)
    const seed = JSON.stringify(defaultSettingsJson())
    await conn.execute(
      `INSERT INTO notification_settings (id, settings_json) VALUES (1, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [seed],
    )
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS notification_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        site_id VARCHAR(64) NULL,
        service_key VARCHAR(64) NOT NULL,
        title VARCHAR(512) NOT NULL,
        body TEXT NOT NULL,
        route VARCHAR(255) NOT NULL DEFAULT '/',
        read_at TIMESTAMP NULL DEFAULT NULL,
        ntfy_ok TINYINT(1) NOT NULL DEFAULT 0,
        ntfy_topic VARCHAR(512) NULL,
        ntfy_sequence_id VARCHAR(128) NULL,
        payload_json JSON NULL,
        INDEX idx_events_inbox (read_at, created_at DESC),
        INDEX idx_events_created (created_at)
      )
    `)
    for (const stmt of [
      'ALTER TABLE notification_events ADD COLUMN ntfy_topic VARCHAR(512) NULL',
      'ALTER TABLE notification_events ADD COLUMN ntfy_sequence_id VARCHAR(128) NULL',
    ]) {
      try {
        await conn.execute(stmt)
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code
        if (code !== 'ER_DUP_FIELDNAME') throw e
      }
    }
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS notification_poller_state (
        site_id VARCHAR(64) NOT NULL PRIMARY KEY,
        snapshot_json LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `)
  } finally {
    await conn.end()
  }
}
