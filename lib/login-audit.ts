import { prisma } from '@/lib/prisma'
import { formatAppUserDisplayName } from '@/lib/roles'

const LOGIN_ACTIVITY_LIMIT = 200
const PAGE_VISIT_LIMIT = 500
const PAGE_PATH_MAX_LENGTH = 200

/** Pages that are never logged (auth screens and public forms). */
const UNTRACKED_PREFIXES = ['/login', '/reset-password', '/forgot-password', '/apply']

export const PAGE_VISIT_RETENTION_DAYS = 90

/** Returns the new login event id (the session id), or null if the write failed. */
export async function recordLoginEvent(user: {
  id: string
  username: string
  firstName?: string | null
  lastName?: string | null
}): Promise<string | null> {
  try {
    const event = await prisma.loginEvent.create({
      data: {
        userId: user.id,
        username: user.username,
        displayName: formatAppUserDisplayName(user)
      },
      select: { id: true }
    })
    return event.id
  } catch (e) {
    console.error('login audit write failed', e)
    return null
  }
}

/** Pathname only (no query string or hash). Returns null when the path should not be logged. */
export function normalizeTrackedPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let path = raw.trim().split(/[?#]/)[0]
  if (!path.startsWith('/') || path.startsWith('//')) return null
  if (path.length > 1) path = path.replace(/\/+$/, '')
  if (path.length > PAGE_PATH_MAX_LENGTH) return null
  if (path.startsWith('/api/') || path.startsWith('/_next')) return null
  if (UNTRACKED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null
  return path
}

export async function recordPageVisit(loginEventId: string, path: string): Promise<void> {
  try {
    await prisma.pageVisit.create({ data: { loginEventId, path } })
  } catch (e) {
    // Includes a login event that was deleted or never created: tracking must never break the app.
    console.error('page visit write failed', e)
  }
}

export async function listLoginEvents() {
  return prisma.loginEvent.findMany({
    orderBy: { loggedAt: 'desc' },
    take: LOGIN_ACTIVITY_LIMIT,
    select: {
      id: true,
      username: true,
      displayName: true,
      loggedAt: true
    }
  })
}

export async function listPageVisits(loginEventId: string) {
  return prisma.pageVisit.findMany({
    where: { loginEventId },
    orderBy: { visitedAt: 'asc' },
    take: PAGE_VISIT_LIMIT,
    select: { id: true, path: true, visitedAt: true }
  })
}

export async function prunePageVisits(): Promise<number> {
  const cutoff = new Date(Date.now() - PAGE_VISIT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const result = await prisma.pageVisit.deleteMany({ where: { visitedAt: { lt: cutoff } } })
  return result.count
}
