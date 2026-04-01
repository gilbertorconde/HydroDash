import crypto from 'node:crypto'

export type HydrodashSessionSlice = {
  authenticated?: boolean
  siteId?: string
}

export type OsSiteConfig = {
  id: string
  label?: string
  baseUrl: string
  password?: string
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`)
  }
  return String(value).trim()
}

function parseOptionalPort(value?: string): number | undefined {
  if (!value || !String(value).trim()) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error('OS_PORT must be an integer between 1 and 65535')
  }
  return n
}

function normalizeBaseUrl(raw: string): string {
  const optionalPort = parseOptionalPort(process.env.OS_PORT)
  const base = new URL(raw)
  if (optionalPort !== undefined && !base.port) {
    base.port = String(optionalPort)
  }
  base.pathname = base.pathname.replace(/\/+$/, '')
  return base.toString().replace(/\/+$/, '')
}

function computePwHash(): string {
  const direct = process.env.OS_PW_HASH
  if (direct && String(direct).trim()) return String(direct).trim().toLowerCase()

  const plain = process.env.OS_PASSWORD
  if (!plain || !String(plain).trim()) {
    throw new Error('Set either OS_PASSWORD or OS_PW_HASH')
  }
  return crypto.createHash('md5').update(String(plain), 'utf8').digest('hex').toLowerCase()
}

function hashPlainPassword(plain: string): string {
  return crypto.createHash('md5').update(String(plain), 'utf8').digest('hex').toLowerCase()
}

function parseOsSites(): OsSiteConfig[] {
  const raw = process.env.OS_SITES
  if (!raw?.trim()) return []
  try {
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return []
    const out: OsSiteConfig[] = []
    for (const x of j) {
      if (!x || typeof x !== 'object') continue
      const o = x as Record<string, unknown>
      const id = typeof o.id === 'string' ? o.id : null
      const baseUrl = typeof o.baseUrl === 'string' ? o.baseUrl : null
      if (!id || !baseUrl) continue
      out.push({
        id,
        label: typeof o.label === 'string' ? o.label : undefined,
        baseUrl,
        password: typeof o.password === 'string' ? o.password : undefined,
      })
    }
    return out
  } catch {
    return []
  }
}

export function listOsSitesPublic(): { id: string; label: string }[] {
  return parseOsSites().map((s) => ({ id: s.id, label: s.label || s.id }))
}

function resolveSitePwHash(site: OsSiteConfig): string {
  if (site.password?.trim()) {
    return hashPlainPassword(site.password.trim())
  }
  const sharedPlain = process.env.OS_PASSWORD
  if (sharedPlain?.trim()) {
    return hashPlainPassword(sharedPlain.trim())
  }
  const sharedHash = process.env.OS_PW_HASH
  if (sharedHash?.trim()) {
    return String(sharedHash).trim().toLowerCase()
  }
  throw new Error(
    'Multi-site: set password on each OS_SITES entry, or set OS_PASSWORD / OS_PW_HASH for shared device password',
  )
}

/**
 * When `OS_SITES` is set, the proxy uses the session’s `siteId` (default: first site).
 * Otherwise uses `OS_BASE_URL` + `OS_PASSWORD` / `OS_PW_HASH` (legacy single-controller).
 */
export function getControllerConfig(session?: HydrodashSessionSlice) {
  const sites = parseOsSites()
  if (sites.length > 0) {
    const want = session?.siteId
    const site = (want ? sites.find((s) => s.id === want) : undefined) ?? sites[0]
    return {
      baseUrl: normalizeBaseUrl(site.baseUrl),
      pwHash: resolveSitePwHash(site),
    }
  }

  const rawBase = getRequiredEnv('OS_BASE_URL')
  return {
    baseUrl: normalizeBaseUrl(rawBase),
    pwHash: computePwHash(),
  }
}
