export function octetsToIp(a: number, b: number, c: number, d: number): string {
  const q = (n: number) => Math.max(0, Math.min(255, Math.floor(Number(n)) || 0))
  return `${q(a)}.${q(b)}.${q(c)}.${q(d)}`
}

export function parseIpToOctets(s: string): [number, number, number, number] | null {
  const parts = s.trim().split('.')
  if (parts.length !== 4) return null
  const o = parts.map((p) => parseInt(p, 10))
  if (o.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null
  return [o[0], o[1], o[2], o[3]]
}
