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
  type PendingNotification,
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
  updateNotificationEventNtfyMeta,
} from '../server/notifications/db'
import {
  getNotificationsFetchTimeoutSec,
  getNotificationsHealthPort,
  getNotificationsOfflineAlertMin,
  getNotificationsPollIntervalSec,
  getNotificationsRetentionDays,
  isNotificationsHealthDisabled,
  isNotificationsWorkerEnabled,
} from '../server/envDefaults'
import { postNtfy } from '../server/notifications/ntfy'
import {
  DEFAULT_NOTIFICATION_ROUTE,
  isServiceEnabled,
  resolveNtfyTopic,
  type NotificationServiceKey,
  type NotificationSettingsJson,
} from '../server/notifications/types'

const POLL_SEC = getNotificationsPollIntervalSec()
const PRUNE_DAYS = getNotificationsRetentionDays()
const HEALTH_PORT = getNotificationsHealthPort()
const FETCH_TIMEOUT_MS = getNotificationsFetchTimeoutSec() * 1000
/** No successful poll for this long → alert, and the stored snapshot is too old to diff against. */
const OFFLINE_ALERT_SEC = Math.max(getNotificationsOfflineAlertMin() * 60, POLL_SEC * 3)
const FETCH_RETRY_DELAY_MS = 2000
/** Health fails when no tick has completed within this window (loop stuck). */
const HEALTH_STALE_MS = (POLL_SEC * 3 + 120) * 1000

type Site = { siteId: string; label: string; baseUrl: string; pwHash: string }

type FetchResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** In-memory per-site reachability; snapshot age in the DB is the durable "last success". */
const siteState = new Map<string, { failingSinceMs: number | null; offlineAlerted: boolean }>()

let lastTickDoneMs = Date.now()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function describeFetchError(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'TimeoutError') return `timeout after ${FETCH_TIMEOUT_MS / 1000}s`
    const cause = (e as { cause?: { code?: string; message?: string } }).cause
    if (cause?.code) return `${e.message} (${cause.code})`
    if (cause?.message) return `${e.message} (${cause.message})`
    return e.message
  }
  return String(e)
}

async function fetchOsJsonOnce<T>(baseUrl: string, pwHash: string, path: string): Promise<FetchResult<T>> {
  const url = new URL(path.replace(/^\/+/, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  url.searchParams.set('pw', pwHash)
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true, data: (await res.json()) as T }
  } catch (e) {
    return { ok: false, error: describeFetchError(e) }
  }
}

async function fetchOsJson<T>(baseUrl: string, pwHash: string, path: string): Promise<FetchResult<T>> {
  const first = await fetchOsJsonOnce<T>(baseUrl, pwHash, path)
  if (first.ok) return first
  await sleep(FETCH_RETRY_DELAY_MS)
  return fetchOsJsonOnce<T>(baseUrl, pwHash, path)
}

function parseJpPrograms(raw: Record<string, unknown> | null): ProgramRow[] {
  if (!raw) return []
  const pd = raw.pd as ProgramRow[] | undefined
  return Array.isArray(pd) ? pd : []
}

function formatDuration(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

async function emitEvents(
  pool: Pool,
  site: Site,
  settings: NotificationSettingsJson,
  events: PendingNotification[],
): Promise<void> {
  const ntfyBase = process.env.NTFY_SERVER_URL?.trim()
  const ntfyToken = process.env.NTFY_ACCESS_TOKEN?.trim()

  for (const ev of events) {
    const key = ev.key as NotificationServiceKey
    if (!isServiceEnabled(settings, key)) continue

    const rowId = await insertNotificationEvent(pool, {
      siteId: site.siteId === 'default' ? null : site.siteId,
      serviceKey: key,
      title: ev.title,
      body: ev.body,
      route: ev.route,
      ntfyOk: false,
      payload: ev.payload,
    })

    const sequenceId = `hd${rowId}`
    if (ntfyBase) {
      const topic = resolveNtfyTopic(settings, key, site.siteId)
      const ntfyOk = await postNtfy({
        baseUrl: ntfyBase,
        topic,
        title: ev.title,
        body: ev.body,
        accessToken: ntfyToken,
        sequenceId,
      })
      if (!ntfyOk) console.warn(`[notify] ntfy publish failed for ${key} (topic ${topic})`)
      await updateNotificationEventNtfyMeta(pool, rowId, {
        ntfyOk,
        ntfyTopic: topic,
        ntfySequenceId: sequenceId,
      })
    }
  }
}

async function processSite(site: Site, pool: Pool): Promise<void> {
  const settings = await loadNotificationSettings(pool)
  const prefix = site.label ? `[${site.label}] ` : ''
  const state = siteState.get(site.siteId) ?? { failingSinceMs: null, offlineAlerted: false }
  siteState.set(site.siteId, state)

  // Sequential on purpose: OpenSprinkler handles concurrent connections poorly.
  const jc = await fetchOsJson<ControllerState>(site.baseUrl, site.pwHash, '/jc')
  const js = jc.ok ? await fetchOsJson<{ sn: number[]; nstations?: number }>(site.baseUrl, site.pwHash, '/js') : null
  const prevRow = await loadPollerSnapshot(pool, site.siteId)

  if (!jc.ok || !js?.ok) {
    const reason = !jc.ok ? `/jc: ${jc.error}` : `/js: ${js && !js.ok ? js.error : 'not fetched'}`
    const now = Date.now()
    state.failingSinceMs ??= now
    // Last success comes from the DB snapshot so the offline window survives worker restarts.
    const offlineSec = prevRow ? prevRow.ageSec : Math.round((now - state.failingSinceMs) / 1000)
    console.warn(`[notify] skip ${site.siteId}: ${reason} (no data for ${formatDuration(offlineSec)})`)

    if (!state.offlineAlerted && offlineSec >= OFFLINE_ALERT_SEC) {
      state.offlineAlerted = true
      await emitEvents(pool, site, settings, [
        {
          key: 'controller_offline',
          title: `${prefix}Controller unreachable`,
          body: `No response from the controller for ${formatDuration(offlineSec)}. Last error: ${reason}`,
          route: DEFAULT_NOTIFICATION_ROUTE.controller_offline,
          payload: { offlineSec, error: reason },
        },
      ])
    }
    return
  }

  const jp = await fetchOsJson<Record<string, unknown>>(site.baseUrl, site.pwHash, '/jp')
  if (!jp.ok) console.warn(`[notify] ${site.siteId}: /jp failed (${jp.error}); program names unavailable`)
  const pd = parseJpPrograms(jp.ok ? jp.data : null)
  const curr = buildPollerSnapshotV1(jc.data, js.data, pd)

  const stale = prevRow !== null && prevRow.ageSec >= OFFLINE_ALERT_SEC
  const prev = prevRow && !stale ? parsePollerSnapshotJson(prevRow.json) : null

  const events: PendingNotification[] = []
  if (stale) {
    console.info(`[notify] ${site.siteId}: reachable again after ${formatDuration(prevRow.ageSec)}; not diffing stale snapshot`)
    events.push({
      key: 'controller_online',
      title: `${prefix}Controller reachable again`,
      body: `No data for ${formatDuration(prevRow.ageSec)}. Changes during that time were not notified.`,
      route: DEFAULT_NOTIFICATION_ROUTE.controller_online,
      payload: { offlineSec: prevRow.ageSec },
    })
  }
  events.push(...diffPollerSnapshots(prev, curr, site.label, pd))

  state.failingSinceMs = null
  state.offlineAlerted = false

  await emitEvents(pool, site, settings, events)
  await savePollerSnapshot(pool, site.siteId, JSON.stringify(curr))
}

let tickCount = 0

async function tick(pool: Pool): Promise<void> {
  const sites = listOsSitesForWorker()
  for (const site of sites) {
    try {
      await processSite(site, pool)
    } catch (e) {
      console.error(`[notify] site ${site.siteId} error`, e)
    }
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
      const sinceMs = Date.now() - lastTickDoneMs
      const healthy = sinceMs <= HEALTH_STALE_MS
      res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'text/plain' })
      res.end(healthy ? 'ok' : `stalled: last tick ${Math.round(sinceMs / 1000)}s ago`)
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

/** MariaDB may still be starting when the stack (re)boots; retry instead of crash-looping. */
async function ensureSchemaWithRetry(): Promise<void> {
  const maxAttempts = 30
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureNotificationsSchemaReady()
      return
    } catch (e) {
      if (attempt >= maxAttempts) throw e
      const delayMs = Math.min(10_000, 1000 * attempt)
      console.warn(`[notify] DB not ready (attempt ${attempt}/${maxAttempts}): ${describeFetchError(e)}; retry in ${delayMs / 1000}s`)
      await sleep(delayMs)
    }
  }
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
    await ensureSchemaWithRetry()
  } catch (e) {
    console.error('[notify] failed to apply DB schema', e)
    process.exit(1)
  }

  startHealthServer()

  console.info(
    `[notify] poll every ${POLL_SEC}s, sites=${listOsSitesForWorker().length}, ` +
      `fetch timeout ${FETCH_TIMEOUT_MS / 1000}s, offline alert after ${formatDuration(OFFLINE_ALERT_SEC)}`,
  )

  for (;;) {
    try {
      await tick(pool)
    } catch (e) {
      console.error('[notify] tick error', e)
    }
    lastTickDoneMs = Date.now()
    await sleep(POLL_SEC * 1000)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
