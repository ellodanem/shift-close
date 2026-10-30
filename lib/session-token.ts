import { SignJWT, jwtVerify } from 'jose'
import { normalizeAppRole } from '@/lib/roles'

export const SESSION_COOKIE = 'sc_token'

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET must be set (min 16 characters) in production')
    }
    return new TextEncoder().encode('dev-only-auth-secret-min-16-chars')
  }
  return new TextEncoder().encode(secret)
}

export interface SessionPayload {
  userId: string
  role: string
  isSuperAdmin: boolean
  rememberDevice: boolean
  sessionVersion: number
  /** LoginEvent id for this sign-in. Missing on tokens issued before page tracking. */
  loginEventId?: string
}

export async function signSessionToken(
  user: { id: string; role: string; isSuperAdmin: boolean; sessionVersion: number },
  options?: { rememberMe?: boolean; loginEventId?: string | null }
): Promise<string> {
  const rememberMe = Boolean(options?.rememberMe)
  return new SignJWT({
    role: normalizeAppRole(user.role),
    sa: user.isSuperAdmin,
    sv: user.sessionVersion,
    ...(rememberMe ? { rd: true } : {}),
    ...(options?.loginEventId ? { sid: options.loginEventId } : {})
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(rememberMe ? '30d' : '1d')
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (!payload.sub) return null
    return {
      userId: payload.sub,
      role: normalizeAppRole(String(payload.role ?? '')),
      isSuperAdmin: Boolean(payload.sa),
      rememberDevice: Boolean(payload.rd),
      sessionVersion: Number(payload.sv ?? 0),
      loginEventId: typeof payload.sid === 'string' && payload.sid ? payload.sid : undefined
    }
  } catch {
    return null
  }
}
