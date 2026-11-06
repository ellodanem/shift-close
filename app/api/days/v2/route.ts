import { NextRequest, NextResponse } from 'next/server'
import { addCalendarDaysYmd, businessTodayYmd, isYmd } from '@/lib/datetime-policy'
import { buildDayReportsV2 } from '@/lib/day-reports-v2'

export const dynamic = 'force-dynamic'

/** GET /api/days/v2?from=YYYY-MM-DD&to=YYYY-MM-DD — End of Day with the Cstore comparison (defaults to last 45 days). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')?.trim() || ''
    const to = searchParams.get('to')?.trim() || ''
    if (from && !isYmd(from)) {
      return NextResponse.json({ error: 'from must be YYYY-MM-DD' }, { status: 400 })
    }
    if (to && !isYmd(to)) {
      return NextResponse.json({ error: 'to must be YYYY-MM-DD' }, { status: 400 })
    }
    if (from && to && from > to) {
      return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 })
    }
    const sinceDate = from || (to ? undefined : addCalendarDaysYmd(businessTodayYmd(), -45))
    const days = await buildDayReportsV2({
      ...(sinceDate ? { sinceDate } : {}),
      ...(to ? { untilDate: to } : {})
    })
    return NextResponse.json(days, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('Error fetching End of Day V2:', error)
    return NextResponse.json({ error: 'Failed to fetch End of Day' }, { status: 500 })
  }
}
