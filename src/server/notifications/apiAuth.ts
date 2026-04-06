import { getSession } from '@tanstack/react-start/server'
import { getSessionConfig } from '../auth'
import type { HydrodashSessionSlice } from '../os'

/** @returns Response if unauthorized, otherwise undefined */
export async function assertNotificationsAuth(): Promise<Response | undefined> {
  const session = await getSession<HydrodashSessionSlice>(getSessionConfig())
  if (!session.data.authenticated) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return undefined
}
