import { NextRequest, NextResponse } from 'next/server'
import { buildLateAbsentReport } from '@/lib/late-absent-report'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/attendance/late-absent-report?startDate=&endDate=
 * Rostered staff late/absent tallies for a date range.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const startDate = searchParams.get('startDate')?.trim()
    const endDate = searchParams.get('endDate')?.trim()

    if (!startDate || !endDate || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      return NextResponse.json(
        { error: 'startDate and endDate required (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const report = await buildLateAbsentReport({ startDate, endDate })
    return NextResponse.json(report)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to build report'
    const status =
      msg.includes('Invalid') || msg.includes('must be') || msg.includes('too long') ? 400 : 500
    if (status === 500) console.error('late-absent-report GET', e)
    return NextResponse.json({ error: msg }, { status })
  }
}
