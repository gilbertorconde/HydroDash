import { createFileRoute } from '@tanstack/react-router'
import {
  ensureNotificationsSchemaReady,
  getNotificationsDbPool,
  insertNotificationEvent,
  loadNotificationSettings,
  ntfyPushConfigured,
} from '../../../server/notifications/db'
import { assertNotificationsAuth } from '../../../server/notifications/apiAuth'
import { postNtfy } from '../../../server/notifications/ntfy'

function testNtfyTopic(settings: { defaultTopic: string; topicsByService: Record<string, string> }): string {
  const byKey = settings.topicsByService['manual_test']?.trim()
  if (byKey) return byKey
  return settings.defaultTopic.trim() || 'hydrodash'
}

export const Route = createFileRoute('/api/notifications/test')({
  server: {
    handlers: {
      POST: async () => {
        const unauthorized = await assertNotificationsAuth()
        if (unauthorized) return unauthorized

        const pool = getNotificationsDbPool()
        if (!pool) {
          return Response.json({ error: 'Notifications database not configured' }, { status: 503 })
        }

        try {
          await ensureNotificationsSchemaReady()
        } catch {
          return Response.json({ error: 'Notifications database unavailable' }, { status: 503 })
        }

        const settings = await loadNotificationSettings(pool)
        const title = 'HydroDash test'
        const body = 'If this appears in the header inbox and on ntfy, notifications are working.'
        const route = '/more'

        const ntfyBase = process.env.NTFY_SERVER_URL?.trim()
        const ntfyToken = process.env.NTFY_ACCESS_TOKEN?.trim()

        let push: 'skipped' | 'ok' | 'failed' = 'skipped'
        let ntfyOk = false
        if (ntfyBase) {
          push = 'failed'
          ntfyOk = await postNtfy({
            baseUrl: ntfyBase,
            topic: testNtfyTopic(settings),
            title,
            body,
            accessToken: ntfyToken,
          })
          if (ntfyOk) push = 'ok'
        }

        await insertNotificationEvent(pool, {
          siteId: null,
          serviceKey: 'manual_test',
          title,
          body,
          route,
          ntfyOk,
          payload: { source: 'manual_test' },
        })

        return Response.json({
          ok: true,
          push,
          pushConfigured: ntfyPushConfigured(),
        })
      },
    },
  },
})
