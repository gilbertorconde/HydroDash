import { createFileRoute } from '@tanstack/react-router'
import {
  ensureNotificationsSchemaReady,
  getNotificationsDbPool,
  loadNotificationSettings,
  saveNotificationSettings,
} from '../../../server/notifications/db'
import { assertNotificationsAuth } from '../../../server/notifications/apiAuth'
import { mergeNotificationSettings, type NotificationSettingsJson } from '../../../server/notifications/types'

export const Route = createFileRoute('/api/notifications/settings')({
  server: {
    handlers: {
      PUT: async ({ request }) => {
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

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }

        const b = body as Partial<NotificationSettingsJson>
        const current = await loadNotificationSettings(pool)
        const merged = mergeNotificationSettings({
          defaultTopic: typeof b.defaultTopic === 'string' ? b.defaultTopic : current.defaultTopic,
          topicsByService: {
            ...current.topicsByService,
            ...(b.topicsByService && typeof b.topicsByService === 'object' ? b.topicsByService : {}),
          },
          topicsBySiteId: {
            ...(current.topicsBySiteId ?? {}),
            ...(b.topicsBySiteId && typeof b.topicsBySiteId === 'object' ? b.topicsBySiteId : {}),
          },
          enabledServices: {
            ...current.enabledServices,
            ...(b.enabledServices && typeof b.enabledServices === 'object' ? b.enabledServices : {}),
          },
        })

        await saveNotificationSettings(pool, merged)
        return Response.json({ ok: true, settings: merged })
      },
    },
  },
})
