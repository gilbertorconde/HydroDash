import type { JsonAll } from '../../api/types'

/** Values of `?section=` on /settings. Order = order on the landing list. */
export const SETTINGS_SECTION_IDS = [
  'location',
  'watering',
  'app',
  'masters',
  'stations',
  'sensors',
  'integrations',
  'lcd',
  'network',
  'power',
  'logging',
  'security',
  'danger',
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

export function isSettingsSectionId(v: unknown): v is SettingsSectionId {
  return typeof v === 'string' && (SETTINGS_SECTION_IDS as readonly string[]).includes(v)
}

export type SectionMeta = {
  id: SettingsSectionId
  title: string
  description: string
  group: 'basic' | 'advanced'
  /** False when the controller firmware exposes none of the section's options (row is hidden). */
  available: (opts: Record<string, unknown>, st: Record<string, unknown>) => boolean
}

const has = (o: Record<string, unknown>, ...keys: string[]) => keys.some((k) => o[k] !== undefined)

export const SECTION_META: Record<SettingsSectionId, SectionMeta> = {
  location: {
    id: 'location',
    title: 'Location & time',
    description: 'Timezone, location and device clock',
    group: 'basic',
    available: () => true,
  },
  watering: {
    id: 'watering',
    title: 'Watering & weather',
    description: 'Adjustment method and watering level',
    group: 'basic',
    available: () => true,
  },
  app: {
    id: 'app',
    title: 'App preferences',
    description: 'Theme, units, time format, zone list',
    group: 'basic',
    available: () => true,
  },
  masters: {
    id: 'masters',
    title: 'Master valves',
    description: 'Master stations and on/off adjustments',
    group: 'advanced',
    available: (o) => has(o, 'mas'),
  },
  stations: {
    id: 'stations',
    title: 'Stations & timing',
    description: 'Number of stations, delay between zones',
    group: 'advanced',
    available: (o) => has(o, 'ext', 'sdt', 'seq'),
  },
  sensors: {
    id: 'sensors',
    title: 'Sensors wiring',
    description: 'Sensor types, normally open, delays, flow rate',
    group: 'advanced',
    available: (o) => has(o, 'urs', 'sn1t', 'sn2t', 'rso'),
  },
  integrations: {
    id: 'integrations',
    title: 'Integrations',
    description: 'Device name, IFTTT, events, OTC, MQTT, email',
    group: 'advanced',
    available: () => true,
  },
  lcd: {
    id: 'lcd',
    title: 'LCD screen',
    description: 'Contrast and brightness',
    group: 'advanced',
    available: (o) => has(o, 'con', 'lit', 'dim'),
  },
  network: {
    id: 'network',
    title: 'Network',
    description: 'DHCP, static IP, NTP, HTTP port, device ID',
    group: 'advanced',
    available: (o) => has(o, 'dhcp', 'ntp', 'ar', 'sar', 'hp0', 'hp1', 'devid', 'ip1', 'ntp1'),
  },
  power: {
    id: 'power',
    title: 'Power & hardware',
    description: 'Boost time, current limits, voltages',
    group: 'advanced',
    available: (o) => has(o, 'bst', 'imin', 'imax', 'tpdv', 'laton', 'latof'),
  },
  logging: {
    id: 'logging',
    title: 'Logging',
    description: 'Record watering history on the controller',
    group: 'advanced',
    available: (o) => has(o, 'lg'),
  },
  security: {
    id: 'security',
    title: 'Security',
    description: 'Controller password',
    group: 'advanced',
    available: () => true,
  },
  danger: {
    id: 'danger',
    title: 'Danger zone',
    description: 'Clear logs, delete programs, factory resets',
    group: 'advanced',
    available: () => true,
  },
}

export function availableSections(data: JsonAll | undefined, group: SectionMeta['group']): SectionMeta[] {
  const opts = data?.options ?? {}
  const st = data?.settings ?? {}
  return SETTINGS_SECTION_IDS.map((id) => SECTION_META[id]).filter(
    (m) => m.group === group && (!data || m.available(opts, st)),
  )
}
