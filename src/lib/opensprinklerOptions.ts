/**
 * OpenSprinkler firmware option key ↔ index mapping (JSON /co API, firmware 2.1.9+).
 * Source: OpenSprinkler-App www/js/main.js OSApp.Constants.keyIndex
 */
export const OPTION_KEY_INDEX = {
  tz: 1,
  ntp: 2,
  dhcp: 3,
  ip1: 4,
  ip2: 5,
  ip3: 6,
  ip4: 7,
  gw1: 8,
  gw2: 9,
  gw3: 10,
  gw4: 11,
  hp0: 12,
  hp1: 13,
  ar: 14,
  ext: 15,
  seq: 16,
  sdt: 17,
  mas: 18,
  mton: 19,
  mtof: 20,
  urs: 21,
  rso: 22,
  wl: 23,
  den: 24,
  ipas: 25,
  devid: 26,
  con: 27,
  lit: 28,
  dim: 29,
  bst: 30,
  uwt: 31,
  ntp1: 32,
  ntp2: 33,
  ntp3: 34,
  ntp4: 35,
  lg: 36,
  mas2: 37,
  mton2: 38,
  mtof2: 39,
  fpr0: 41,
  fpr1: 42,
  re: 43,
  dns1: 44,
  dns2: 45,
  dns3: 46,
  dns4: 47,
  sar: 48,
  ife: 49,
  sn1t: 50,
  sn1o: 51,
  sn2t: 52,
  sn2o: 53,
  sn1on: 54,
  sn1of: 55,
  sn2on: 56,
  sn2of: 57,
  subn1: 58,
  subn2: 59,
  subn3: 60,
  subn4: 61,
  fwire: 62,
  laton: 63,
  latof: 64,
  ife2: 65,
  imin: 66,
  imax: 67,
  tpdv: 68,
} as const

/** IANA-style labels matching OpenSprinkler App options.js timezone list. */
export const TIMEZONE_LABELS = [
  '-12:00',
  '-11:30',
  '-11:00',
  '-10:00',
  '-09:30',
  '-09:00',
  '-08:30',
  '-08:00',
  '-07:00',
  '-06:00',
  '-05:00',
  '-04:30',
  '-04:00',
  '-03:30',
  '-03:00',
  '-02:30',
  '-02:00',
  '+00:00',
  '+01:00',
  '+02:00',
  '+03:00',
  '+03:30',
  '+04:00',
  '+04:30',
  '+05:00',
  '+05:30',
  '+05:45',
  '+06:00',
  '+06:30',
  '+07:00',
  '+08:00',
  '+08:45',
  '+09:00',
  '+09:30',
  '+10:00',
  '+10:30',
  '+11:00',
  '+11:30',
  '+12:00',
  '+12:45',
  '+13:00',
  '+13:45',
  '+14:00',
] as const

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Decode firmware `tz` option to UI label (same formula as OpenSprinkler App options.js). */
export function timezoneLabelFromTz(tzRaw: unknown): string | null {
  const optTz = typeof tzRaw === 'number' ? tzRaw : Number(tzRaw)
  if (!Number.isFinite(optTz)) return null
  const tz = optTz - 48
  const sign = tz >= 0 ? '+' : '-'
  const abs = Math.abs(tz)
  const hh = abs / 4 >> 0
  const mm1 = (((abs % 4) * 15) / 10) >> 0
  const mm2 = ((abs % 4) * 15) % 10
  return `${sign}${pad2(hh)}:${mm1}${mm2}`
}

/** Encode a timezone label from the dropdown to firmware `tz` (OpenSprinkler App submit o1). */
export function tzValueFromTimezoneLabel(data: string): number {
  const tz = data.split(':')
  let h = parseInt(tz[0] ?? '0', 10)
  let m = parseInt(tz[1] ?? '0', 10)
  m = ((m / 15) >> 0) / 4.0
  h = h + (h >= 0 ? m : -m)
  return ((h + 12) * 4) >> 0
}

/** Notification event bit order — must match OpenSprinkler-App options.js `events` object order. */
export const NOTIFICATION_EVENT_LABELS = [
  'Program start',
  'Sensor 1 update',
  'Flow sensor update',
  'Weather adjustment update',
  'Controller reboot',
  'Station finish',
  'Sensor 2 update',
  'Rain delay update',
  'Station start',
  'Flow alert',
  'Under/overcurrent fault',
] as const

export function packNotificationEvents(bits: boolean[]): number {
  let v = 0
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) v |= 1 << i
  }
  return v
}

export function unpackNotificationEvents(value: number, count: number): boolean[] {
  const out: boolean[] = []
  for (let i = 0; i < count; i++) {
    out.push((value & (1 << i)) !== 0)
  }
  return out
}

/** Weather adjustment methods (ids match firmware uwt). */
export const ADJUSTMENT_METHODS: { id: number; name: string; minFw?: number }[] = [
  { id: 0, name: 'Manual' },
  { id: 1, name: 'Zimmerman' },
  { id: 2, name: 'Auto rain delay', minFw: 216 },
  { id: 3, name: 'ETo', minFw: 216 },
  { id: 4, name: 'Monthly', minFw: 220 },
]
