import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { buildDayReports } from '@/lib/day-reports'
import { eligibleSaveDates } from '@/lib/cstore-save-eligibility'
import { BUSINESS_TIME_ZONE } from '@/lib/datetime-policy'
import { getTodayYmdInZone } from '@/lib/missing-deposit-slip-alert'

export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/harvest-agent/cstore-day-report/eligible?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Days in the range whose End of Day is Complete in Shift Close and that are before the current
 * business day. The harvest agent only starts and saves a Cstore daily report for these.
 */
export async function GET(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const from = request.nextUrl.searchParams.get('from') ?? ''
  const to = request.nextUrl.searchParams.get('to') ?? ''
  if (!YMD.test(from) || !YMD.test(to) || from > to) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })
  }
  try {
    const today = getTodayYmdInZone(BUSINESS_TIME_ZONE)
    const days = await buildDayReports({ sinceDate: from, untilDate: to })
    const dates = eligibleSaveDates(
      days.map((d) => ({ date: d.date, status: d.status })),
      today
    ).filter((d) => d >= from && d <= to)
    return NextResponse.json({ today, dates })
  } catch (err) {
    console.error('cstore-day-report eligible error', err)
    return NextResponse.json({ error: 'Failed to list days' }, { status: 500 })
  }
}
