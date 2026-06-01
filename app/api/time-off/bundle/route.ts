import { NextRequest, NextResponse } from 'next/server'
import { fetchTimeOffBundle } from '@/lib/time-off-bundle'
import { validateTimeOffDateRange } from '@/lib/time-off-range'

export const dynamic = 'force-dynamic'

/**
 * GET ?startDate=&endDate=&includeSickDocuments=1
 * Single round trip for Time Off tabs: vacations, day offs, sick leave, call outs.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = validateTimeOffDateRange(
      searchParams.get('startDate'),
      searchParams.get('endDate')
    )
    if ('error' in range) {
      return NextResponse.json({ error: range.error }, { status: range.status })
    }

    const includeSickDocuments =
      searchParams.get('includeSickDocuments') === '1' ||
      searchParams.get('includeSickDocuments') === 'true'

    const payload = await fetchTimeOffBundle(range, { includeSickDocuments })
    return NextResponse.json(payload)
  } catch (error) {
    console.error('time-off bundle error:', error)
    return NextResponse.json({ error: 'Failed to load time off data' }, { status: 500 })
  }
}
