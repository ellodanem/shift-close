import { NextRequest, NextResponse } from 'next/server'
import { listPageVisits } from '@/lib/login-audit'
import { canManageAppUsers } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Pages opened during one login session, oldest first. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request)
  if (!session || !canManageAppUsers(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const visits = await listPageVisits(params.id)
  return NextResponse.json(
    visits.map((visit) => ({
      id: visit.id,
      path: visit.path,
      visitedAt: visit.visitedAt.toISOString()
    }))
  )
}
