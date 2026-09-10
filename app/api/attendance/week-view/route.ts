import { NextRequest, NextResponse } from 'next/server'
import { buildAttendanceWeekView } from '@/lib/attendance-week-view'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/attendance/week-view?weekStart=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const raw = request.nextUrl.searchParams.get('weekStart')?.trim() ?? ''
    const weekStart = DATE_RE.test(raw) ? raw : ''
    const payload = await buildAttendanceWeekView(weekStart)
    return NextResponse.json(payload)
  } catch (e) {
    console.error('attendance week-view GET', e)
    return NextResponse.json({ error: 'Failed to load week view' }, { status: 500 })
  }
}
