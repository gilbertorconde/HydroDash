import { createFileRoute } from '@tanstack/react-router'
import { useSession } from '@tanstack/react-start/server'
import { getSessionConfig } from '../../../server/auth'
import { listOsSitesPublic } from '../../../server/os'

export const Route = createFileRoute('/api/auth/site')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await useSession<{ authenticated?: boolean; siteId?: string }>(getSessionConfig())
        if (!session.data.authenticated) {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const sites = listOsSitesPublic()
        if (sites.length === 0) {
          return Response.json({ ok: false, error: 'Multi-site is not configured (OS_SITES)' }, { status: 400 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const siteId = (body as { siteId?: unknown })?.siteId
        if (typeof siteId !== 'string' || !sites.some((s) => s.id === siteId)) {
          return Response.json({ ok: false, error: 'Unknown siteId' }, { status: 400 })
        }

        await session.update({ ...session.data, siteId })
        return Response.json({ ok: true, activeSiteId: siteId })
      },
    },
  },
})
