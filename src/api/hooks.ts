import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { osCommand, osFetchDebug, osFetchJson } from './client'
import type { ControllerState, JsonAll, ProgramRow } from './types'
import type { NotificationSettingsJson } from '../server/notifications/types'
import { programToVParam, getProgramRange } from '../lib/programCodec'
import { normalizeJlPayload } from '../lib/irrigationLog'

export const qk = {
  all: ['hydrodash'] as const,
  auth: () => [...qk.all, 'auth'] as const,
  notifications: () => [...qk.all, 'notifications'] as const,
  notificationsConfig: () => [...qk.notifications(), 'config'] as const,
  notificationsInbox: (limit: number) => [...qk.notifications(), 'inbox', limit] as const,
  notificationsUnread: () => [...qk.notifications(), 'unread'] as const,
  ja: () => [...qk.all, 'ja'] as const,
  jc: () => [...qk.all, 'jc'] as const,
  jo: () => [...qk.all, 'jo'] as const,
  jp: () => [...qk.all, 'jp'] as const,
  jn: () => [...qk.all, 'jn'] as const,
  je: () => [...qk.all, 'je'] as const,
  jl: (start: number, end: number) => [...qk.all, 'jl', start, end] as const,
  db: () => [...qk.all, 'db'] as const,
}

const isBrowser = typeof window !== 'undefined'

export type AuthSessionPayload = {
  authenticated: boolean
  sites: { id: string; label: string }[]
  activeSiteId?: string
}

async function fetchAuthSession(): Promise<AuthSessionPayload> {
  const res = await fetch('/api/auth/session', { credentials: 'include' })
  if (!res.ok) throw new Error('Unable to verify session')
  const j = (await res.json()) as Partial<AuthSessionPayload>
  return {
    authenticated: !!j.authenticated,
    sites: Array.isArray(j.sites) ? j.sites : [],
    activeSiteId: j.activeSiteId,
  }
}

export function useAuthSession() {
  return useQuery({
    queryKey: qk.auth(),
    queryFn: fetchAuthSession,
    enabled: isBrowser,
    staleTime: 10_000,
  })
}

export function useAuthLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(json.error || 'Login failed')
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.auth() }),
  })
}

export function useAuthLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error('Logout failed')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.auth() }),
  })
}

export type NotificationsConfigPayload = {
  enabled: boolean
  pushEnabled: boolean
  databaseConfigured?: boolean
  settings: NotificationSettingsJson | null
}

export type NotificationInboxItem = {
  id: string
  createdAt: string
  siteId: string | null
  serviceKey: string
  title: string
  body: string
  route: string
  readAt: string | null
}

async function fetchNotificationsConfig(): Promise<NotificationsConfigPayload> {
  const res = await fetch('/api/notifications/config', { credentials: 'include' })
  if (!res.ok) throw new Error('Notifications config failed')
  return (await res.json()) as NotificationsConfigPayload
}

export function useNotificationsConfig(options?: Partial<UseQueryOptions<NotificationsConfigPayload>>) {
  return useQuery({
    queryKey: qk.notificationsConfig(),
    queryFn: fetchNotificationsConfig,
    enabled: isBrowser,
    staleTime: 60_000,
    ...options,
  })
}

export function useNotificationsUnreadCount() {
  return useQuery({
    queryKey: qk.notificationsUnread(),
    queryFn: async () => {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'include' })
      if (!res.ok) return { count: 0, enabled: false }
      return (await res.json()) as { count: number; enabled: boolean }
    },
    enabled: isBrowser,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useNotificationsInbox(limit = 50, enabled = true) {
  return useQuery({
    queryKey: qk.notificationsInbox(limit),
    queryFn: async () => {
      const res = await fetch(`/api/notifications/inbox?limit=${limit}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Inbox failed')
      const j = (await res.json()) as { items: NotificationInboxItem[] }
      return j.items
    },
    enabled: isBrowser && enabled,
  })
}

export function useNotificationsMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error('Mark read failed')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notificationsInbox(50) })
      qc.invalidateQueries({ queryKey: qk.notificationsInbox(100) })
      qc.invalidateQueries({ queryKey: qk.notificationsUnread() })
    },
  })
}

export function useNotificationsSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings: NotificationSettingsJson) => {
      const res = await fetch('/api/notifications/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(settings),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'Save failed')
      return j as { ok: boolean; settings: NotificationSettingsJson }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notificationsConfig() })
    },
  })
}

export type NotificationsTestResult = {
  ok: boolean
  push: 'skipped' | 'ok' | 'failed'
  pushConfigured: boolean
}

export function useNotificationsTest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      const j = (await res.json().catch(() => ({}))) as NotificationsTestResult & { error?: string }
      if (!res.ok) throw new Error(j.error || 'Test failed')
      return j
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notificationsInbox(50) })
      qc.invalidateQueries({ queryKey: qk.notificationsInbox(100) })
      qc.invalidateQueries({ queryKey: qk.notificationsUnread() })
    },
  })
}

export function useJsonAll(options?: Partial<UseQueryOptions<JsonAll>>) {
  return useQuery({
    queryKey: qk.ja(),
    queryFn: () => osFetchJson<JsonAll>('/ja'),
    staleTime: 30_000,
    ...options,
  })
}

export function useStationStatus(pollMs: number | false = 4000) {
  return useQuery({
    queryKey: [...qk.all, 'js'],
    queryFn: () => osFetchJson<{ sn: number[]; nstations: number }>('/js'),
    refetchInterval: pollMs === false ? false : pollMs,
    staleTime: 2000,
  })
}

export function useController(
  pollMs: number | false = 5000,
  options?: Partial<UseQueryOptions<ControllerState>>,
) {
  return useQuery({
    queryKey: qk.jc(),
    queryFn: () => osFetchJson<ControllerState>('/jc'),
    refetchInterval: pollMs === false ? false : pollMs,
    staleTime: pollMs === false ? 30_000 : Math.min(2000, Number(pollMs) / 2),
    ...options,
  })
}

export function useOptionsQuery(options?: Partial<UseQueryOptions<Record<string, unknown>>>) {
  return useQuery({
    queryKey: qk.jo(),
    queryFn: () => osFetchJson<Record<string, unknown>>('/jo'),
    staleTime: 60_000,
    ...options,
  })
}

export function useProgramsQuery(options?: Partial<UseQueryOptions<Record<string, unknown>>>) {
  return useQuery({
    queryKey: qk.jp(),
    queryFn: () => osFetchJson<Record<string, unknown>>('/jp'),
    staleTime: 30_000,
    ...options,
  })
}

export function useStationsMeta(options?: Partial<UseQueryOptions<Record<string, unknown>>>) {
  return useQuery({
    queryKey: qk.jn(),
    queryFn: () => osFetchJson<Record<string, unknown>>('/jn'),
    staleTime: 60_000,
    ...options,
  })
}

export function useStationSpecials(options?: Partial<UseQueryOptions<Record<string, unknown>>>) {
  return useQuery({
    queryKey: qk.je(),
    queryFn: () => osFetchJson<Record<string, unknown>>('/je'),
    staleTime: 60_000,
    ...options,
  })
}

export function useLogs(start: number, end: number, enabled = true) {
  return useQuery({
    queryKey: qk.jl(start, end),
    queryFn: async () => {
      const json = await osFetchJson<unknown>('/jl', { start, end })
      return normalizeJlPayload(json)
    },
    enabled: isBrowser && enabled && Number.isFinite(start) && Number.isFinite(end) && end >= start,
    staleTime: 60_000,
  })
}

export function useDebugInfo(enabled = false) {
  return useQuery({
    queryKey: qk.db(),
    queryFn: () => osFetchDebug(),
    enabled,
    staleTime: 30_000,
  })
}

function invalidateCore(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: qk.all })
}

export function useSwitchSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (siteId: string) => {
      const res = await fetch('/api/auth/site', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ siteId }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(json.error || 'Could not switch site')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.auth() })
      invalidateCore(qc)
    },
  })
}

export function useChangeValues() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: Record<string, string | number>) => osCommand('/cv', params),
    onSuccess: () => invalidateCore(qc),
  })
}

export function useChangeOptions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: Record<string, string | number | boolean>) => osCommand('/co', params),
    onSuccess: () => invalidateCore(qc),
  })
}

export function useManualStation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      sid: number
      en: 0 | 1
      t?: number
      qo?: number
      ssta?: number
    }) => osCommand('/cm', p as unknown as Record<string, string | number>),
    onSuccess: () => invalidateCore(qc),
  })
}

export function usePauseQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { dur?: number; repl?: number }) =>
      osCommand('/pq', p as Record<string, string | number>),
    onSuccess: () => invalidateCore(qc),
  })
}

export function useProgramToggle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pid, en }: { pid: number; en: 0 | 1 }) =>
      osCommand('/cp', { pid, en }),
    onSuccess: () => invalidateCore(qc),
  })
}

export function useProgramUwt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pid, uwt }: { pid: number; uwt: 0 | 1 }) =>
      osCommand('/cp', { pid, uwt }),
    onSuccess: () => invalidateCore(qc),
  })
}

export function useDeleteProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pid: number) => osCommand('/dp', { pid }),
    onSuccess: () => invalidateCore(qc),
  })
}

/**
 * Reorder programs using repeated `/up` (OpenSprinkler has no arbitrary reorder API).
 * Indices are 0-based positions in the `pd` array.
 */
export function useReorderPrograms() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      if (from === to || from < 0 || to < 0) return
      if (from > to) {
        for (let k = from; k > to; k--) {
          await osCommand('/up', { pid: k })
        }
      } else {
        for (let k = from + 1; k <= to; k++) {
          await osCommand('/up', { pid: k })
        }
      }
    },
    onSuccess: () => invalidateCore(qc),
  })
}

export function useRunProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { pid: number; uwt: 0 | 1; qo?: number }) =>
      osCommand('/mp', p as Record<string, string | number>),
    onSuccess: () => invalidateCore(qc),
  })
}

export function useRunOnce() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      t: string
      uwt?: number
      qo?: number
      cnt?: number
      int?: number
      anno?: string
    }) => osCommand('/cr', p as unknown as Record<string, string | number>),
    onSuccess: () => invalidateCore(qc),
  })
}

export function useSaveProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      pid: number
      name: string
      v: string
      endr: number
      from: number
      to: number
    }) =>
      osCommand('/cp', {
        pid: p.pid,
        name: p.name,
        v: p.v,
        endr: p.endr,
        from: p.from,
        to: p.to,
      }),
    onSuccess: () => invalidateCore(qc),
  })
}

export function buildSaveProgramPayload(pd: ProgramRow, pid: number) {
  const v = programToVParam(pd)
  const { endr, from, to } = getProgramRange(pd)
  const name = pd[5]
  return { pid, name, v, endr, from, to }
}

export function useChangeStations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: Record<string, string | number>) =>
      osCommand('/cs', params),
    onSuccess: () => invalidateCore(qc),
  })
}

export function useChangePassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { npw: string; cpw: string }) =>
      osCommand('/sp', { npw: p.npw, cpw: p.cpw }),
    onSuccess: () => invalidateCore(qc),
  })
}

export function useDeleteLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (day: string) => osCommand('/dl', { day }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  })
}

/** Clear all irrigation logs (`day=all`, same as OpenSprinkler-App “Clear Logs”). */
export function useClearAllLogs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => osCommand('/dl', { day: 'all' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  })
}

/** Delete every program (`pid=-1`, same as OpenSprinkler-App). */
export function useDeleteAllPrograms() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => osCommand('/dp', { pid: -1 }),
    onSuccess: () => invalidateCore(qc),
  })
}
