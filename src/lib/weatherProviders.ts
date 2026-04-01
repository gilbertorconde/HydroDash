/** Matches OpenSprinkler-App `Constants.weather.PROVIDERS` (subset). */
export const WEATHER_PROVIDERS = [
  { name: 'Apple (default)', id: 'Apple', needsKey: false },
  { name: 'AccuWeather', id: 'AW', needsKey: true },
  { name: 'PirateWeather', id: 'PW', needsKey: true },
  { name: 'Open Weather Map', id: 'OWM', needsKey: true },
  { name: 'OpenMeteo', id: 'OpenMeteo', needsKey: false },
  { name: 'DWD', id: 'DWD', needsKey: false },
  { name: 'Weather Underground', id: 'WU', needsKey: true },
] as const

export type WeatherProviderId = (typeof WEATHER_PROVIDERS)[number]['id']

export function providerById(id: string) {
  return WEATHER_PROVIDERS.find((p) => p.id === id)
}

/**
 * OpenSprinkler-App `OSApp.Weather.weatherErrors` — negative = firmware HTTP, positive = weather script `errCode`.
 */
const WEATHER_ERROR_LABELS: Record<string, string> = {
  '-4': 'Empty response',
  '-3': 'Timed out',
  '-2': 'Connection failed',
  '-1': 'No response',
  '0': 'Success',
  '1': 'Weather data error',
  '2': 'Location error',
  '3': 'PWS error',
  '4': 'Adjustment method error',
  '5': 'Adjustment options error',
  '10': 'Insufficient weather data',
  '11': 'Weather data incomplete',
  '12': 'Weather data request failed',
  '20': 'Location service API error',
  '21': 'Location not found',
  '22': 'Invalid location format',
  '30': 'Invalid Weather Underground PWS',
  '31': 'Invalid Weather Underground key',
  '32': 'PWS authentication error',
  '33': 'Unsupported PWS method',
  '34': 'PWS not provided',
  '35': 'Missing weather API key',
  '40': 'Unsupported adjustment method',
  '41': 'No adjustment method provided',
  '50': 'Corrupt adjustment options',
  '51': 'Missing adjustment option',
  '99': 'Unexpected error',
}

export function describeWeatherError(code: unknown): string | null {
  if (code == null || typeof code !== 'number' || !Number.isFinite(code)) return null
  return WEATHER_ERROR_LABELS[String(code)] ?? null
}

/** Parse `wto` from `/jc` — firmware sends an object; older paths may use a JSON string. */
export function wtoRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  return {}
}

/**
 * Map stored `provider` to our select `id` (OG stores ids like `AW`; some data uses display names).
 */
export function normalizeWeatherProviderId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'Apple'
  const t = raw.trim()
  if (providerById(t)) return t
  const compact = t.toLowerCase().replace(/[\s_-]/g, '')
  const aliases: Record<string, string> = {
    accuweather: 'AW',
    pirateweather: 'PW',
    openweathermap: 'OWM',
    openweather: 'OWM',
    weatherunderground: 'WU',
    openmeteo: 'OpenMeteo',
  }
  const mapped = aliases[compact]
  if (mapped && providerById(mapped)) return mapped
  return 'Apple'
}
