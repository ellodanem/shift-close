import { NextRequest, NextResponse } from 'next/server'
import { addCalendarDaysYmd, businessTodayYmd, isYmd } from '@/lib/datetime-policy'
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
    const from = searchParams.get('from')?.trim() || ''
    const to = searchParams.get('to')?.trim() || ''
    let sinceDate: string | undefined
    let untilDate: string | undefined

    if (from || to) {
      if (from && !isYmd(from)) {
        return NextResponse.json({ error: 'from must be YYYY-MM-DD' }, { status: 400 })
      }
      if (to && !isYmd(to)) {
        return NextResponse.json({ error: 'to must be YYYY-MM-DD' }, { status: 400 })
      }
      if (from && to && from > to) {
        return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 })
      }
      sinceDate = from || undefined
      untilDate = to || undefined
    } else if (!all) {
      const raw = Number(searchParams.get('recentDays') ?? DEFAULT_RECENT_DAYS)
      const days = Number.isFinite(raw)
        ? Math.min(MAX_RECENT_DAYS, Math.max(MIN_RECENT_DAYS, Math.floor(raw)))
        : DEFAULT_RECENT_DAYS
      sinceDate = addCalendarDaysYmd(businessTodayYmd(), -days)
    }

    const dayReports = await buildDayReports({
      ...(sinceDate ? { sinceDate } : {}),
      ...(untilDate ? { untilDate } : {})
    })
    return NextResponse.json(dayReports, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        ...(sinceDate ? { 'X-Days-Since': sinceDate } : {}),
        ...(untilDate ? { 'X-Days-Until': untilDate } : {})
      }
    })
  } catch (error) {
    console.error('Error fetching day reports:', error)
    return NextResponse.json({ error: 'Failed to fetch day reports' }, { status: 500 })
  }
}
