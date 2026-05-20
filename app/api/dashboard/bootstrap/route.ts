import { NextRequest, NextResponse } from 'next/server'
import { buildDashboardBootstrap } from '@/lib/dashboard-data'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** GET ?year=&month= — single payload for dashboard (replaces ~8–10 parallel widget fetches). */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = Number(searchParams.get('year')) || now.getFullYear()
    const month = Number(searchParams.get('month')) || now.getMonth() + 1

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
    }

    const payload = await buildDashboardBootstrap(session.role, year, month)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('dashboard bootstrap error:', error)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
