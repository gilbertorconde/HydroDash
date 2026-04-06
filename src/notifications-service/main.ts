/**
 * Standalone notification worker: poll OpenSprinkler, diff state, write MariaDB, push ntfy.
 * Run: node dist/notifications-service.mjs   (after npm run build:notify)
 */
import * as http from 'node:http'
import type { Pool } from 'mysql2/promise'
import type { ControllerState, ProgramRow } from '../api/types'
import {
  buildPollerSnapshotV1,
  diffPollerSnapshots,
  parsePollerSnapshotJson,
} from '../lib/notificationSnapshot'
import { listOsSitesForWorker } from '../server/os'
import {
  ensureNotificationsSchemaReady,
  getNotificationsDbPool,
  insertNotificationEvent,
  loadNotificationSettings,
  loadPollerSnapshot,
  pruneOldNotificationEvents,
  savePollerSnapshot,
} from '../server/notifications/db'
import {
  getNotificationsHealthPort,
  getNotificationsPollIntervalSec,
  getNotificationsRetentionDays,
  isNotificationsHealthDisabled,
  isNotificationsWorkerEnabled,
} from '../server/envDefaults'
import { postNtfy } from '../server/notifications/ntfy'
import { isServiceEnabled, resolveNtfyTopic, type NotificationServiceKey } from '../server/notifications/types'

const POLL_SEC = getNotificationsPollIntervalSec()
const PRUNE_DAYS = getNotificationsRetentionDays()
const HEALTH_PORT = getNotificationsHealthPort()

async function fetchOsJson<T>(baseUrl: string, pwHash: string, path: string): Promise<T | null> {
  const url = new URL(path.replace(/^\/+/, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  url.searchParams.set('pw', pwHash)
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function parseJpPrograms(raw: Record<string, unknown> | null): ProgramRow[] {
  if (!raw) return []
  const pd = raw.pd as ProgramRow[] | undefined
  return Array.isArray(pd) ? pd : []
}

async function processSite(
  site: { siteId: string; label: string; baseUrl: string; pwHash: string },
  pool: Pool,
): Promise<void> {
  const settings = await loadNotificationSettings(pool)

  const [jc, js, jp] = await Promise.all([
    fetchOsJson<ControllerState>(site.baseUrl, site.pwHash, '/jc'),
    fetchOsJson<{ sn: number[]; nstations?: number }>(site.baseUrl, site.pwHash, '/js'),
    fetchOsJson<Record<string, unknown>>(site.baseUrl, site.pwHash, '/jp'),
  ])

  if (!jc || !js) {
    console.warn(`[notify] skip ${site.siteId}: missing jc or js`)
    return
  }

  const pd = parseJpPrograms(jp)
  const curr = buildPollerSnapshotV1(jc, js, pd)
  const prevRaw = await loadPollerSnapshot(pool, site.siteId)
  const prev = parsePollerSnapshotJson(prevRaw)

  const pending = diffPollerSnapshots(prev, curr, site.label, pd)

  const ntfyBase = process.env.NTFY_SERVER_URL?.trim()
  const ntfyToken = process.env.NTFY_ACCESS_TOKEN?.trim()

  for (const ev of pending) {
    const key = ev.key as NotificationServiceKey
    if (!isServiceEnabled(settings, key)) continue

    let ntfyOk = false
    if (ntfyBase) {
      const topic = resolveNtfyTopic(settings, key, site.siteId)
      ntfyOk = await postNtfy({
        baseUrl: ntfyBase,
        topic,
        title: ev.title,
        body: ev.body,
        accessToken: ntfyToken,
      })
    }

    await insertNotificationEvent(pool, {
      siteId: site.siteId === 'default' ? null : site.siteId,
      serviceKey: key,
      title: ev.title,
      body: ev.body,
      route: ev.route,
      ntfyOk,
      payload: ev.payload,
    })
  }

  await savePollerSnapshot(pool, site.siteId, JSON.stringify(curr))
}

let tickCount = 0

async function tick(pool: Pool): Promise<void> {
  const sites = listOsSitesForWorker()
  for (const site of sites) {
    await processSite(site, pool)
  }
  tickCount += 1
  if (tickCount % 48 === 0) {
    await pruneOldNotificationEvents(pool, PRUNE_DAYS)
  }
}

function startHealthServer(): http.Server | null {
  if (isNotificationsHealthDisabled()) return null
  const s = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }
    res.writeHead(404)
    res.end()
  })
  s.listen(HEALTH_PORT, '0.0.0.0', () => {
    console.info(`[notify] health http://0.0.0.0:${HEALTH_PORT}/health`)
  })
  return s
}

async function main(): Promise<void> {
  if (!isNotificationsWorkerEnabled()) {
    console.info('[notify] NOTIFICATIONS_ENABLED=0, exiting')
    process.exit(0)
  }

  const pool = getNotificationsDbPool()
  if (!pool) {
    console.error('[notify] DATABASE_URL is required')
    process.exit(1)
  }

  try {
    await ensureNotificationsSchemaReady()
  } catch (e) {
    console.error('[notify] failed to apply DB schema', e)
    process.exit(1)
  }

  startHealthServer()

  console.info(`[notify] poll every ${POLL_SEC}s, sites=${listOsSitesForWorker().length}`)

  for (;;) {
    try {
      await tick(pool)
    } catch (e) {
      console.error('[notify] tick error', e)
    }
    await new Promise((r) => setTimeout(r, POLL_SEC * 1000))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
