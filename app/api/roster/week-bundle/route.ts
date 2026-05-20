import { NextRequest, NextResponse } from 'next/server'
import { fetchRosterWeekBundle } from '@/lib/roster-week-bundle'

export const dynamic = 'force-dynamic'

/** GET ?weekStart=YYYY-MM-DD&weekEnd=YYYY-MM-DD — roster week + day-off + sick leave + holidays. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get('weekStart')
    const weekEnd = searchParams.get('weekEnd')

    if (!weekStart || !weekEnd) {
      return NextResponse.json(
        { error: 'weekStart and weekEnd (YYYY-MM-DD) are required' },
        { status: 400 }
      )
    }

    const payload = await fetchRosterWeekBundle(weekStart, weekEnd)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('roster week-bundle error:', error)
    return NextResponse.json({ error: 'Failed to load roster week bundle' }, { status: 500 })
  }
}
