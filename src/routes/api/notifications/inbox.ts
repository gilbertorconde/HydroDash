import { createFileRoute } from '@tanstack/react-router'
import {
  ensureNotificationsSchemaReady,
  getNotificationsDbPool,
  listNotificationEvents,
} from '../../../server/notifications/db'
import { assertNotificationsAuth } from '../../../server/notifications/apiAuth'

export const Route = createFileRoute('/api/notifications/inbox')({
  server: {
    handlers: {
      GET: async ({ request }) => {
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

        const url = new URL(request.url)
        const limit = Number(url.searchParams.get('limit') ?? '50')
        const rows = await listNotificationEvents(pool, limit)
        return Response.json({
          items: rows.map((r) => ({
            id: String(r.id),
            createdAt: r.created_at.toISOString(),
            siteId: r.site_id,
            serviceKey: r.service_key,
            title: r.title,
            body: r.body,
            route: r.route,
            readAt: r.read_at ? r.read_at.toISOString() : null,
          })),
        })
      },
    },
  },
})
