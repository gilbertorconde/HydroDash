import { createFileRoute } from '@tanstack/react-router'
import { useSession } from '@tanstack/react-start/server'
import { getSessionConfig, isValidLoginPassword } from '../../../server/auth'
import { listOsSitesPublic } from '../../../server/os'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const password = (body as { password?: unknown })?.password
        if (typeof password !== 'string' || !isValidLoginPassword(password)) {
          return Response.json({ ok: false, error: 'Invalid credentials' }, { status: 401 })
        }

        const session = await useSession<{ authenticated: boolean; siteId?: string }>(getSessionConfig())
        const sites = listOsSitesPublic()
        await session.update({
          authenticated: true,
          ...(sites.length > 0 ? { siteId: sites[0].id } : {}),
        })

        return Response.json({ ok: true })
      },
    },
  },
})
