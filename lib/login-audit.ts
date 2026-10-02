import { prisma } from '@/lib/prisma'
import { formatAppUserDisplayName } from '@/lib/roles'

const LOGIN_ACTIVITY_LIMIT = 200

export async function recordLoginEvent(user: {
  id: string
  username: string
  firstName?: string | null
  lastName?: string | null
}): Promise<void> {
  try {
    await prisma.loginEvent.create({
      data: {
        userId: user.id,
        username: user.username,
        displayName: formatAppUserDisplayName(user)
      }
    })
  } catch (e) {
    console.error('login audit write failed', e)
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
