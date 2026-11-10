import { NextRequest, NextResponse } from 'next/server'
import { isYmd } from '@/lib/datetime-policy'
import { buildRangeReport } from '@/lib/day-range-report'
import { buildDayReportsV2 } from '@/lib/day-reports-v2'
import { toMiniReport } from '@/lib/mini-report'

export const dynamic = 'force-dynamic'

/**
 * GET /api/days/mini?from=YYYY-MM-DD&to=YYYY-MM-DD
 * The mini report (Collected and Deposit totals) for the End of Day records in the range.
 * This is the only End of Day data the stakeholder role may read; nothing else is returned.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')?.trim() || ''
    const to = searchParams.get('to')?.trim() || ''
    if (!isYmd(from) || !isYmd(to)) {
      return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })
    }
    if (from > to) {
      return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 })
    }
    const days = (await buildDayReportsV2({ sinceDate: from, untilDate: to })).filter(
      (d) => d.date >= from && d.date <= to
    )
    if (days.length === 0) {
      return NextResponse.json({ report: null }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
    }
    const report = toMiniReport(buildRangeReport(days))
    return NextResponse.json({ report }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('Error building mini report:', error)
    return NextResponse.json({ error: 'Failed to build the mini report' }, { status: 500 })
  }
}
