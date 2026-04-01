import crypto from 'node:crypto'

const LOGIN_PASSWORD = process.env.HYDRODASH_LOGIN_PASSWORD || ''
const SESSION_SECRET = process.env.HYDRODASH_SESSION_SECRET || ''

if (!LOGIN_PASSWORD) {
  console.warn('HYDRODASH_LOGIN_PASSWORD is not set; login endpoint will reject all attempts.')
}

if (!SESSION_SECRET) {
  console.warn('HYDRODASH_SESSION_SECRET is not set; auth session cannot be created.')
}

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

export function isValidLoginPassword(candidate: string): boolean {
  if (!LOGIN_PASSWORD) return false
  return constantTimeEqual(candidate, LOGIN_PASSWORD)
}

export function getSessionConfig() {
  if (!SESSION_SECRET) {
    throw new Error('HYDRODASH_SESSION_SECRET is required')
  }

  return {
    password: SESSION_SECRET,
    name: 'hydrodash',
    maxAge: 60 * 60 * 24,
    cookie: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  }
}
