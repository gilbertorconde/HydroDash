/**
 * Compare controller firmware (options.fwv / options.fwm) to the latest
 * OpenSprinkler unified release on GitHub.
 *
 * Version numbers are read from `defines.h` on the release tag (`OS_FW_VERSION`,
 * `OS_FW_MINOR`) — the same source as the firmware build.
 */

export const OPENSPRINKLER_FIRMWARE_GITHUB_LATEST_API =
  'https://api.github.com/repos/OpenSprinkler/OpenSprinkler-Firmware/releases/latest'

const DEFINES_API = (ref: string) =>
  `https://api.github.com/repos/OpenSprinkler/OpenSprinkler-Firmware/contents/defines.h?ref=${encodeURIComponent(ref)}`

export type ParsedUnifiedFirmwareTag = { fwv: number; fwm: number }

/** fwv encodes dotted x.y.z as x*100 + y*10 + z (e.g. 221 → 2.2.1). */
export function formatUnifiedFirmwareVersion(fwv: number, fwm: number): string {
  const x = Math.floor(fwv / 100)
  const y = Math.floor((fwv % 100) / 10)
  const z = fwv % 10
  return `${x}.${y}.${z}(${fwm})`
}

/**
 * Parse `defines.h` text for OS_FW_VERSION / OS_FW_MINOR.
 * @throws If the expected macros are missing or invalid.
 */
export function parseDefinesFirmwareVersion(source: string): ParsedUnifiedFirmwareTag {
  const v = /#define\s+OS_FW_VERSION\s+(\d+)/.exec(source)
  const m = /#define\s+OS_FW_MINOR\s+(\d+)/.exec(source)
  if (!v || !m) {
    throw new Error('defines.h is missing OS_FW_VERSION or OS_FW_MINOR')
  }
  const fwv = Number(v[1])
  const fwm = Number(m[1])
  if (!Number.isFinite(fwv) || !Number.isFinite(fwm)) {
    throw new Error('defines.h has invalid OS_FW_VERSION or OS_FW_MINOR')
  }
  return { fwv, fwm }
}

async function fetchDefinesHAtRef(ref: string, headers: HeadersInit): Promise<string> {
  const res = await fetch(DEFINES_API(ref), { headers })
  if (!res.ok) {
    throw new Error(`defines.h fetch failed (${res.status})`)
  }
  const j = (await res.json()) as { encoding?: string; content?: string }
  if (j.encoding !== 'base64' || typeof j.content !== 'string') {
    throw new Error('defines.h response is not base64 content')
  }
  const b64 = j.content.replace(/\s/g, '')
  try {
    return atob(b64)
  } catch {
    throw new Error('defines.h content could not be decoded')
  }
}

export function deviceFirmwareIsOlderThanRelease(
  device: ParsedUnifiedFirmwareTag,
  release: ParsedUnifiedFirmwareTag,
): boolean {
  if (release.fwv > device.fwv) return true
  if (release.fwv < device.fwv) return false
  return release.fwm > device.fwm
}

export type LatestFirmwareReleaseInfo = {
  tagName: string
  htmlUrl: string
  parsed: ParsedUnifiedFirmwareTag
  /** Display string, e.g. 2.2.1(4); matches official dotted + build wording. */
  versionLabel: string
}

export async function fetchLatestOpenSprinklerFirmwareRelease(): Promise<LatestFirmwareReleaseInfo> {
  const headers = {
    Accept: 'application/vnd.github+json',
  }
  const res = await fetch(OPENSPRINKLER_FIRMWARE_GITHUB_LATEST_API, { headers })
  if (!res.ok) {
    throw new Error(`GitHub returned ${res.status}`)
  }
  const j = (await res.json()) as { tag_name?: unknown; html_url?: unknown }
  const tagName = typeof j.tag_name === 'string' ? j.tag_name : ''
  const htmlUrl = typeof j.html_url === 'string' ? j.html_url : ''
  if (!tagName || !htmlUrl) {
    throw new Error('Unexpected GitHub release payload')
  }

  const definesText = await fetchDefinesHAtRef(tagName, headers)
  const parsed = parseDefinesFirmwareVersion(definesText)
  const versionLabel = formatUnifiedFirmwareVersion(parsed.fwv, parsed.fwm)

  return {
    tagName,
    htmlUrl,
    parsed,
    versionLabel,
  }
}
