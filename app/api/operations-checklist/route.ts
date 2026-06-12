import { NextRequest, NextResponse } from 'next/server'
import { canAccessOperationsChecklist } from '@/lib/operations-checklist-access'
import { loadOperationsChecklist } from '@/lib/operations-checklist-data'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const accessUser = { role: session.role, isSuperAdmin: session.isSuperAdmin }
    if (!canAccessOperationsChecklist(accessUser)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await loadOperationsChecklist(session.role, accessUser)
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('operations-checklist GET', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load checklist' },
      { status: 500 }
    )
  }
}
