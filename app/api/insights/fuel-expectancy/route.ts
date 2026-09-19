import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { loadFuelExpectancy } from '@/lib/fuel-inventory-data'
import { isFullAccessRole } from '@/lib/roles'
import { isYmd } from '@/lib/datetime-policy'

export const dynamic = 'force-dynamic'

/** GET ?date=YYYY-MM-DD — fuel on-hand vs weekday expectancy. Any signed-in user. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = request.nextUrl.searchParams.get('date')
  if (date && !isYmd(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const payload = await loadFuelExpectancy({
      asOfYmd: date || undefined,
      canManage: isFullAccessRole(session.role)
    })
    return NextResponse.json(payload)
  } catch (error) {
    console.error('fuel-expectancy GET', error)
    return NextResponse.json({ error: 'Failed to load fuel expectancy' }, { status: 500 })
  }
}
