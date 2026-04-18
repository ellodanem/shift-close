import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'
import { normalizeAppRole } from '@/lib/roles'

export const SESSION_COOKIE = 'sc_token'

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET must be set (min 16 characters) in production')
    }
    return new TextEncoder().encode('dev-only-auth-secret-min-16-chars')
  }
  return new TextEncoder().encode(s)
}

export interface SessionPayload {
  userId: string
  role: string
  isSuperAdmin: boolean
  /** True when the user signed in with "Remember me on this device" (JWT claim `rd`). */
  rememberDevice: boolean
}

/** When rememberMe is false: short-lived JWT + session cookie (no maxAge). When true: 30-day JWT + persistent cookie. */
export async function signSessionToken(
  user: {
    id: string
    role: string
    isSuperAdmin: boolean
  },
  options?: { rememberMe?: boolean }
): Promise<string> {
  const rememberMe = Boolean(options?.rememberMe)
  const exp = rememberMe ? '30d' : '1d'
  return new SignJWT({
    role: normalizeAppRole(user.role),
    sa: user.isSuperAdmin,
    ...(rememberMe ? { rd: true } : {})
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const sub = payload.sub
    if (!sub) return null
    return {
      userId: sub,
      role: normalizeAppRole(String(payload.role ?? '')),
      isSuperAdmin: Boolean(payload.sa),
      rememberDevice: Boolean((payload as { rd?: unknown }).rd)
    }
  } catch {
    return null
  }
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}
