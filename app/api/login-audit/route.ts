import { NextRequest, NextResponse } from 'next/server'
import { listLoginEvents } from '@/lib/login-audit'
import { canManageAppUsers } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !canManageAppUsers(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const events = await listLoginEvents()
  return NextResponse.json(
    events.map((event) => ({
      id: event.id,
      username: event.username,
      displayName: event.displayName,
      loggedAt: event.loggedAt.toISOString()
    }))
  )
}
