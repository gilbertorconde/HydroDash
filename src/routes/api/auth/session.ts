import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@tanstack/react-start/server'
import { getSessionConfig } from '../../../server/auth'
import { listOsSitesPublic } from '../../../server/os'

export const Route = createFileRoute('/api/auth/session')({
  server: {
    handlers: {
      GET: async () => {
        const session = await getSession<{ authenticated?: boolean; siteId?: string }>(getSessionConfig())
        const authenticated = !!session.data.authenticated
        const sites = listOsSitesPublic()
        let activeSiteId = session.data.siteId
        if (authenticated && sites.length > 0) {
          if (!activeSiteId || !sites.some((s) => s.id === activeSiteId)) {
            activeSiteId = sites[0].id
          }
        } else {
          activeSiteId = undefined
        }
        return Response.json({
          authenticated,
          sites: authenticated && sites.length > 0 ? sites : [],
          activeSiteId: authenticated ? activeSiteId : undefined,
        })
      },
    },
  },
})
