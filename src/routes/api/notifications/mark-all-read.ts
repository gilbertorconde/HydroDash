import { createFileRoute } from '@tanstack/react-router'
import {
  ensureNotificationsSchemaReady,
  getNotificationsDbPool,
  markAllNotificationsRead,
} from '../../../server/notifications/db'
import { assertNotificationsAuth } from '../../../server/notifications/apiAuth'

export const Route = createFileRoute('/api/notifications/mark-all-read')({
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

        await markAllNotificationsRead(pool)
        return Response.json({ ok: true })
      },
    },
  },
})
