import { createFileRoute } from '@tanstack/react-router'
import {
  ensureNotificationsSchemaReady,
  getNotificationsDbPool,
  loadNotificationSettings,
  notificationsFeatureEnabled,
  ntfyPushConfigured,
} from '../../../server/notifications/db'
import { assertNotificationsAuth } from '../../../server/notifications/apiAuth'

export const Route = createFileRoute('/api/notifications/config')({
  server: {
    handlers: {
      GET: async () => {
        const unauthorized = await assertNotificationsAuth()
        if (unauthorized) return unauthorized

        const pool = getNotificationsDbPool()
        if (!pool) {
          return Response.json({
            enabled: false,
            pushEnabled: false,
            settings: null,
          })
        }

        try {
          await ensureNotificationsSchemaReady()
        } catch {
          return Response.json(
            { error: 'Notifications database unavailable' },
            { status: 503 },
          )
        }

        const settings = await loadNotificationSettings(pool)
        return Response.json({
          enabled: true,
          pushEnabled: ntfyPushConfigured(),
          databaseConfigured: notificationsFeatureEnabled(),
          settings,
        })
      },
    },
  },
})
