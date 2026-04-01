import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@tanstack/react-start/server'
import { getSessionConfig } from '../../../server/auth'
import { getControllerConfig, type HydrodashSessionSlice } from '../../../server/os'

async function forwardRequest(request: Request, splat: string) {
  const session = await getSession<HydrodashSessionSlice>(getSessionConfig())
  if (!session.data.authenticated) {
    return Response.json({ result: 0, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { baseUrl, pwHash } = getControllerConfig(session.data)
    const sourceUrl = new URL(request.url)
    const target = new URL(`${baseUrl}/${splat.replace(/^\/+/, '')}`)

    for (const [k, v] of sourceUrl.searchParams.entries()) {
      if (k === 'pw') continue
      target.searchParams.append(k, v)
    }
    target.searchParams.set('pw', pwHash)

    const method = request.method.toUpperCase()
    const contentType = request.headers.get('content-type') || 'application/json'
    const body = ['GET', 'HEAD'].includes(method) ? undefined : await request.text()

    const upstream = await fetch(target.toString(), {
      method,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': contentType,
      },
      body,
    })

    const payload = await upstream.text()
    return new Response(payload, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
    })
  } catch (error) {
    return Response.json(
      { result: 0, error: error instanceof Error ? error.message : 'Proxy failed' },
      { status: 502 },
    )
  }
}

export const Route = createFileRoute('/api/os/$')({
  server: {
    handlers: {
      GET: ({ request, params }) => forwardRequest(request, params._splat || ''),
      POST: ({ request, params }) => forwardRequest(request, params._splat || ''),
      PUT: ({ request, params }) => forwardRequest(request, params._splat || ''),
      PATCH: ({ request, params }) => forwardRequest(request, params._splat || ''),
      DELETE: ({ request, params }) => forwardRequest(request, params._splat || ''),
    },
  },
})
