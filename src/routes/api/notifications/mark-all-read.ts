import { createFileRoute } from '@tanstack/react-router'
import {
  ensureNotificationsSchemaReady,
  getNotificationsDbPool,
  listUnreadNtfyClearTargets,
  markAllNotificationsRead,
} from '../../../server/notifications/db'
import { assertNotificationsAuth } from '../../../server/notifications/apiAuth'
import { clearNtfyMessage } from '../../../server/notifications/ntfy'

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

        const toClear = await listUnreadNtfyClearTargets(pool)
        await markAllNotificationsRead(pool)

        const ntfyBase = process.env.NTFY_SERVER_URL?.trim()
        const ntfyToken = process.env.NTFY_ACCESS_TOKEN?.trim()
        if (ntfyBase && toClear.length > 0) {
          await Promise.allSettled(
            toClear.map((t) =>
              clearNtfyMessage({
                baseUrl: ntfyBase,
                topic: t.topic,
                sequenceId: t.sequenceId,
                accessToken: ntfyToken,
              }),
            ),
          )
        }

        return Response.json({ ok: true })
      },
    },
  },
})
