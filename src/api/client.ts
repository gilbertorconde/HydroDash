import { DEFAULT_VITE_OPENSPLINKER_BASE_URL } from '../lib/envDefaults'
import { isResultError } from './types'

export class OpenSprinklerHttpError extends Error {
  public readonly status: number
  public readonly body?: string

  constructor(
    message: string,
    status: number,
    body?: string,
  ) {
    super(message)
    this.status = status
    this.body = body
    this.name = 'OpenSprinklerHttpError'
  }
}

export class OpenSprinklerApiError extends Error {
  public readonly code: number

  constructor(
    message: string,
    code: number,
  ) {
    super(message)
    this.code = code
    this.name = 'OpenSprinklerApiError'
  }
}

export function getBaseUrl(): string {
  const raw = import.meta.env.VITE_OPENSPLINKLER_BASE_URL || DEFAULT_VITE_OPENSPLINKER_BASE_URL
  return String(raw).replace(/\/$/, '')
}

function buildUrl(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const base = getBaseUrl().replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  // Relative API bases (e.g. "/api/os") are valid and preferred for same-origin calls.
  if (!/^https?:\/\//i.test(base)) {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue
      search.set(k, String(v))
    }
    const query = search.toString()
    return `${base}${normalizedPath}${query ? `?${query}` : ''}`
  }

  const u = new URL(normalizedPath, `${base}/`)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    u.searchParams.set(k, String(v))
  }
  return u.toString()
}

export async function osFetchJson<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  init?: RequestInit,
): Promise<T> {
  const fetchInit = init ?? {}
  const url = buildUrl(path, params)
  const res = await fetch(url, {
    ...fetchInit,
    credentials: 'include',
    headers: { Accept: 'application/json', ...fetchInit.headers },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new OpenSprinklerHttpError(
      `HTTP ${res.status} for ${path}`,
      res.status,
      text,
    )
  }
  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    throw new OpenSprinklerHttpError('Invalid JSON from controller', res.status, text)
  }
  const err = isResultError(json)
  if (err !== null) {
    throw new OpenSprinklerApiError(`OpenSprinkler error code ${err}`, err)
  }
  return json as T
}

/** Commands that return only `{ result: 1 }` */
export async function osCommand(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<void> {
  await osFetchJson<Record<string, unknown>>(path, params)
}

/** `/db` — no password required per docs */
export async function osFetchDebug(): Promise<Record<string, unknown>> {
  return osFetchJson<Record<string, unknown>>('/db')
}
