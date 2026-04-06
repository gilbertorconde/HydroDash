import { createFileRoute } from '@tanstack/react-router'
import {
  countUnreadNotifications,
  ensureNotificationsSchemaReady,
  getNotificationsDbPool,
} from '../../../server/notifications/db'
import { assertNotificationsAuth } from '../../../server/notifications/apiAuth'

export const Route = createFileRoute('/api/notifications/unread-count')({
  server: {
    handlers: {
      GET: async () => {
        const unauthorized = await assertNotificationsAuth()
        if (unauthorized) return unauthorized

        const pool = getNotificationsDbPool()
        if (!pool) {
          return Response.json({ count: 0, enabled: false })
        }

        try {
          await ensureNotificationsSchemaReady()
        } catch {
          return Response.json({ count: 0, enabled: false })
        }

        const count = await countUnreadNotifications(pool)
        return Response.json({ count, enabled: true })
      },
    },
  },
})
