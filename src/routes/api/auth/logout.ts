import { createFileRoute } from '@tanstack/react-router'
import { clearSession } from '@tanstack/react-start/server'
import { getSessionConfig } from '../../../server/auth'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async () => {
        const { password: _password, ...clearableConfig } = getSessionConfig()
        await clearSession(clearableConfig)
        return Response.json({ ok: true })
      },
    },
  },
})
