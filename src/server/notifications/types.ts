/** Persisted notification settings (merged with code defaults when reading). */
export type NotificationSettingsJson = {
  defaultTopic: string
  topicsByService: Record<string, string>
  topicsBySiteId?: Record<string, string>
  /** Per service_key; missing means use built-in default (on except noisy keys). */
  enabledServices: Record<string, boolean>
}

export type NotificationEventRow = {
  id: string
  createdAt: string
  siteId: string | null
  serviceKey: string
  title: string
  body: string
  route: string
  readAt: string | null
}

export const NOTIFICATION_SERVICE_KEYS = [
  'station_started',
  'station_stopped',
  'program_run_started',
  'program_run_finished',
  'rain_delay_set',
  'rain_delay_cleared',
  'weather_adjust_error',
  'sensor_sn1',
  'sensor_sn2',
  'program_queue_changed',
  'controller_enable_changed',
] as const

export type NotificationServiceKey = (typeof NOTIFICATION_SERVICE_KEYS)[number]

export const NOTIFICATION_SERVICE_LABELS: Record<NotificationServiceKey, string> = {
  station_started: 'Zone started',
  station_stopped: 'Zone stopped',
  program_run_started: 'Program run started',
  program_run_finished: 'Program run finished',
  rain_delay_set: 'Rain delay set',
  rain_delay_cleared: 'Rain delay cleared',
  weather_adjust_error: 'Weather adjustment error',
  sensor_sn1: 'Sensor 1 change',
  sensor_sn2: 'Sensor 2 change',
  program_queue_changed: 'Program queue changed',
  controller_enable_changed: 'Controller enable toggled',
}

export const DEFAULT_NOTIFICATION_ROUTE: Record<NotificationServiceKey, string> = {
  station_started: '/zones',
  station_stopped: '/zones',
  program_run_started: '/programs',
  program_run_finished: '/programs',
  rain_delay_set: '/settings',
  rain_delay_cleared: '/settings',
  weather_adjust_error: '/forecast',
  sensor_sn1: '/settings',
  sensor_sn2: '/settings',
  program_queue_changed: '/programs',
  controller_enable_changed: '/settings',
}

/** Default on/off when key missing from DB `enabledServices`. */
export const DEFAULT_SERVICE_ENABLED: Record<NotificationServiceKey, boolean> = {
  station_started: true,
  station_stopped: true,
  program_run_started: true,
  program_run_finished: true,
  rain_delay_set: true,
  rain_delay_cleared: true,
  weather_adjust_error: true,
  sensor_sn1: true,
  sensor_sn2: true,
  program_queue_changed: false,
  controller_enable_changed: true,
}

export function defaultSettingsJson(): NotificationSettingsJson {
  return {
    defaultTopic: 'hydrodash',
    topicsByService: {},
    topicsBySiteId: {},
    enabledServices: {},
  }
}

export function mergeNotificationSettings(raw: Partial<NotificationSettingsJson> | null): NotificationSettingsJson {
  const d = defaultSettingsJson()
  if (!raw || typeof raw !== 'object') return d
  return {
    defaultTopic: typeof raw.defaultTopic === 'string' && raw.defaultTopic.trim() ? raw.defaultTopic.trim() : d.defaultTopic,
    topicsByService:
      raw.topicsByService && typeof raw.topicsByService === 'object' ? { ...raw.topicsByService } : {},
    topicsBySiteId:
      raw.topicsBySiteId && typeof raw.topicsBySiteId === 'object' ? { ...raw.topicsBySiteId } : {},
    enabledServices:
      raw.enabledServices && typeof raw.enabledServices === 'object' ? { ...raw.enabledServices } : {},
  }
}

export function isServiceEnabled(settings: NotificationSettingsJson, key: NotificationServiceKey): boolean {
  const v = settings.enabledServices[key]
  if (typeof v === 'boolean') return v
  return DEFAULT_SERVICE_ENABLED[key]
}

export function resolveNtfyTopic(
  settings: NotificationSettingsJson,
  serviceKey: NotificationServiceKey,
  siteId: string,
): string {
  const bySite = settings.topicsBySiteId?.[siteId]
  if (bySite?.trim()) return bySite.trim()
  const bySvc = settings.topicsByService[serviceKey]
  if (bySvc?.trim()) return bySvc.trim()
  return settings.defaultTopic.trim() || 'hydrodash'
}
