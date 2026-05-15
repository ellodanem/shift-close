import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolvePostLoginPath } from '@/lib/attendance-viewer'
import { prisma } from '@/lib/prisma'
import { normalizeAppRole } from '@/lib/roles'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

export default async function Home() {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) {
    redirect('/login')
  }

  const session = await verifySessionToken(token)
  if (!session) {
    redirect('/login')
  }

  const user = await prisma.appUser.findUnique({
    where: { id: session.userId },
    select: { homePath: true, role: true }
  })

  if (!user) {
    redirect('/login')
  }

  redirect(
    resolvePostLoginPath({
      homePath: user.homePath,
      role: normalizeAppRole(user.role)
    })
  )
}
