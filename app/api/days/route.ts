import { NextRequest, NextResponse } from 'next/server'
import { addCalendarDaysYmd, businessTodayYmd } from '@/lib/datetime-policy'
import { buildDayReports } from '@/lib/day-reports'

// Always run on the server so Day Reports show latest shift updates (no static/cache)
export const dynamic = 'force-dynamic'

const DEFAULT_RECENT_DAYS = 120
const MIN_RECENT_DAYS = 30
const MAX_RECENT_DAYS = 365

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === '1'
    let sinceDate: string | undefined

    if (!all) {
      const raw = Number(searchParams.get('recentDays') ?? DEFAULT_RECENT_DAYS)
      const days = Number.isFinite(raw)
        ? Math.min(MAX_RECENT_DAYS, Math.max(MIN_RECENT_DAYS, Math.floor(raw)))
        : DEFAULT_RECENT_DAYS
      sinceDate = addCalendarDaysYmd(businessTodayYmd(), -days)
    }

    const dayReports = await buildDayReports(sinceDate ? { sinceDate } : undefined)
    return NextResponse.json(dayReports, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        ...(sinceDate ? { 'X-Days-Since': sinceDate } : {})
      }
    })
  } catch (error) {
    console.error('Error fetching day reports:', error)
    return NextResponse.json({ error: 'Failed to fetch day reports' }, { status: 500 })
  }
}
