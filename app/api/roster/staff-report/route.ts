import { NextRequest, NextResponse } from 'next/server'
import { buildStaffRosterReport } from '@/lib/staff-roster-report'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/roster/staff-report?staffId=&startDate=&endDate=&publishedOnly=1
 * Individual staff scheduled roster for a date range.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const staffId = searchParams.get('staffId')?.trim()
    const startDate = searchParams.get('startDate')?.trim()
    const endDate = searchParams.get('endDate')?.trim()
    const publishedOnlyParam = searchParams.get('publishedOnly')
    const publishedOnly = publishedOnlyParam !== '0' && publishedOnlyParam !== 'false'

    if (!staffId) {
      return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
    }
    if (!startDate || !endDate || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      return NextResponse.json(
        { error: 'startDate and endDate required (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const report = await buildStaffRosterReport({ staffId, startDate, endDate, publishedOnly })
    return NextResponse.json(report)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to build report'
    const status =
      msg === 'Staff not found'
        ? 404
        : msg.includes('Invalid') || msg.includes('must be') || msg.includes('too long')
          ? 400
          : 500
    if (status === 500) console.error('roster staff-report GET', e)
    return NextResponse.json({ error: msg }, { status })
  }
}
