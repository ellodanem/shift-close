import { NextRequest, NextResponse } from 'next/server'
import { buildAttendanceViewerSummary, canAccessAttendanceViewer } from '@/lib/attendance-viewer'
import { calendarYmdInTz, readStationTimeZone } from '@/lib/present-absence'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** GET ?date=YYYY-MM-DD — mobile attendance viewer payload (read-only). Admin, manager, or operations manager. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessAttendanceViewer(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const tz = await readStationTimeZone()
    const raw = request.nextUrl.searchParams.get('date')?.trim()
    const dateYmd =
      raw && DATE_RE.test(raw) ? raw : calendarYmdInTz(new Date(), tz)

    const payload = await buildAttendanceViewerSummary(dateYmd)
    return NextResponse.json(payload)
  } catch (e) {
    console.error('viewer-summary GET', e)
    return NextResponse.json({ error: 'Failed to load attendance viewer' }, { status: 500 })
  }
}
