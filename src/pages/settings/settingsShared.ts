import { useCallback, useMemo, useState } from 'react'
import type { JsonAll } from '../../api/types'

export type OptionPayload = Record<string, string | number | boolean>

/** Everything a section needs from the page: controller data + save / status helpers. */
export type SectionCtx = {
  data: JsonAll
  opts: Record<string, unknown>
  st: Record<string, unknown>
  /** Send `/co` with these keys, refetch `/ja`. Resolves true on success. */
  apply: (p: OptionPayload, okMessage?: string) => Promise<boolean>
  /** True while any `/co` write is in flight. */
  saving: boolean
  notify: (msg: string) => void
  fail: (msg: string) => void
}

export const num = (v: unknown, d = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : d
}

/** `parseInt` for number inputs: empty / invalid → 0. */
export const intOf = (s: string): number => parseInt(s, 10) || 0

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a === 'object' && typeof b === 'object' && a && b) return JSON.stringify(a) === JSON.stringify(b)
  return false
}

/**
 * Edit-buffer over values loaded from the controller. Only touched keys live in the draft, so a
 * refetch updates untouched fields, and `dirtyKeys` is exactly what needs sending.
 */
export function useDraft<T extends Record<string, unknown>>(base: T) {
  const [draft, setDraft] = useState<Partial<T>>({})
  const values = useMemo(() => ({ ...base, ...draft }) as T, [base, draft])
  const dirtyKeys = useMemo(
    () => (Object.keys(draft) as (keyof T & string)[]).filter((k) => !same(draft[k], base[k])),
    [draft, base],
  )
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
  }, [])
  const discard = useCallback(() => setDraft({}), [])
  const isDirty = useCallback((k: keyof T & string) => dirtyKeys.includes(k), [dirtyKeys])
  return { values, set, dirtyKeys, dirty: dirtyKeys.length > 0, isDirty, discard }
}

/** Serialise an object for the firmware's `/co` JSON options (outer braces stripped). */
export function coJsonBlob(parsed: Record<string, unknown>): string {
  return JSON.stringify(parsed).slice(1, -1)
}

export function stringifySettingJson(val: unknown): string {
  if (val == null) return '{}'
  if (typeof val === 'object' && !Array.isArray(val)) return JSON.stringify(val, null, 2)
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) return JSON.stringify(p, null, 2)
    } catch {
      return val
    }
    return val
  }
  return String(val)
}

/** Station options for master selects ("None" + every station). */
export function stationLabel(names: string[], i: number, showNum: boolean): string {
  const name = names[i] || `Station ${i + 1}`
  return showNum ? `${i + 1}. ${name}` : name
}
