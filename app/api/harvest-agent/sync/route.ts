import { NextRequest, NextResponse } from 'next/server'
import { pathnameAllowedForRole } from '@/lib/access-control'
import {
  HarvestSyncActiveError,
  createHarvestSyncRun,
  getHarvestSyncView
} from '@/lib/harvest-sync'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

async function requireHarvestSettings(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !pathnameAllowedForRole('/settings/harvest-agent', session.role)) {
    return null
  }
  return session
}

/**
 * GET /api/harvest-agent/sync
 * Current month plus the active run, or the latest finished run.
 */
export async function GET(request: NextRequest) {
  if (!(await requireHarvestSettings(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await getHarvestSyncView())
  } catch (error) {
    console.error('Harvest sync GET error:', error)
    return NextResponse.json({ error: 'Failed to load sync' }, { status: 500 })
  }
}

/**
 * POST /api/harvest-agent/sync
 * Queue the four harvest jobs for the current St. Lucia month.
 */
export async function POST(request: NextRequest) {
  if (!(await requireHarvestSettings(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const year = typeof body.year === 'number' ? body.year : undefined
    const month = typeof body.month === 'number' ? body.month : undefined
    const run = await createHarvestSyncRun({ year, month })
    const view = await getHarvestSyncView()
    return NextResponse.json({ ...view, run })
  } catch (error) {
    if (error instanceof HarvestSyncActiveError) {
      const view = await getHarvestSyncView()
      return NextResponse.json({ error: error.message, ...view }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Failed to start sync'
    const status = message === 'Year is out of range' || message === 'Month is out of range' ? 400 : 500
    if (status === 500) console.error('Harvest sync POST error:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
