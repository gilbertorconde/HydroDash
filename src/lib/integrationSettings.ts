export type MqttForm = {
  en: number
  host: string
  port: number
  user: string
  pass: string
  pubt: string
  subt: string
}

export type EmailForm = {
  en: number
  host: string
  port: number
  user: string
  pass: string
  recipient: string
}

export type OtcForm = {
  en: number
  token: string
  server: string
}

const MQTT_DEF: MqttForm = {
  en: 0,
  host: 'server',
  port: 1883,
  user: '',
  pass: '',
  pubt: 'opensprinkler',
  subt: '',
}

const EMAIL_DEF: EmailForm = {
  en: 0,
  host: 'smtp.gmail.com',
  port: 465,
  user: '',
  pass: '',
  recipient: '',
}

const OTC_DEF: OtcForm = {
  en: 0,
  token: '',
  server: '',
}

function num(v: unknown, d: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : d
}

function str(v: unknown, d: string): string {
  return typeof v === 'string' ? v : v != null ? String(v) : d
}

export function mqttFromJson(raw: unknown): MqttForm {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...MQTT_DEF }
  const o = raw as Record<string, unknown>
  return {
    en: num(o.en, 0) ? 1 : 0,
    host: str(o.host, MQTT_DEF.host),
    port: num(o.port, MQTT_DEF.port),
    user: str(o.user, ''),
    pass: str(o.pass, ''),
    pubt: str(o.pubt, MQTT_DEF.pubt),
    subt: str(o.subt, ''),
  }
}

export function emailFromJson(raw: unknown): EmailForm {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMAIL_DEF }
  const o = raw as Record<string, unknown>
  return {
    en: num(o.en, 0) ? 1 : 0,
    host: str(o.host, EMAIL_DEF.host),
    port: num(o.port, EMAIL_DEF.port),
    user: str(o.user, ''),
    pass: str(o.pass, ''),
    recipient: str(o.recipient, ''),
  }
}

export function otcFromJson(raw: unknown): OtcForm {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...OTC_DEF }
  const o = raw as Record<string, unknown>
  return {
    en: num(o.en, 0) ? 1 : 0,
    token: str(o.token, ''),
    server: str(o.server, ''),
  }
}

export function mqttToJson(f: MqttForm): Record<string, unknown> {
  return {
    en: f.en ? 1 : 0,
    host: f.host,
    port: f.port,
    user: f.user,
    pass: f.pass,
    pubt: f.pubt,
    subt: f.subt,
  }
}

export function emailToJson(f: EmailForm): Record<string, unknown> {
  return {
    en: f.en ? 1 : 0,
    host: f.host,
    port: f.port,
    user: f.user,
    pass: f.pass,
    recipient: f.recipient,
  }
}

export function otcToJson(f: OtcForm): Record<string, unknown> {
  return {
    en: f.en ? 1 : 0,
    token: f.token,
    server: f.server,
  }
}
