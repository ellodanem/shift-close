import { NextRequest, NextResponse } from 'next/server'
import { normalizeTrackedPath, recordPageVisit } from '@/lib/login-audit'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Records one page opened in the current login session. Always cheap and never an error to the client. */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Sessions that started before page tracking have no login event to attach to.
  if (!session.loginEventId) {
    return new NextResponse(null, { status: 204 })
  }

  const body = await request.json().catch(() => null)
  const path = normalizeTrackedPath(body?.path)
  if (path) {
    await recordPageVisit(session.loginEventId, path)
  }
  return new NextResponse(null, { status: 204 })
}
