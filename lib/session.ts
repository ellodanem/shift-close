import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  SESSION_COOKIE,
  verifySessionToken,
  type SessionPayload
} from '@/lib/session-token'

export { SESSION_COOKIE, signSessionToken, verifySessionToken } from '@/lib/session-token'
export type { SessionPayload } from '@/lib/session-token'

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await verifySessionToken(token)
  if (!session) return null

  const user = await prisma.appUser.findUnique({
    where: { id: session.userId },
    select: { sessionVersion: true }
  })
  return user?.sessionVersion === session.sessionVersion ? session : null
}
