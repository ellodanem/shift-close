import { NextRequest, NextResponse } from 'next/server'
import { buildRosterStaticBootstrap } from '@/lib/roster-static-bootstrap'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** GET — staff, shift templates, and roster settings in one response. */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    const role = session?.role ?? ''
    const payload = await buildRosterStaticBootstrap(role)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('roster static-bootstrap error:', error)
    return NextResponse.json({ error: 'Failed to load roster data' }, { status: 500 })
  }
}
