import { NextRequest, NextResponse } from 'next/server'
import {
  buildPresenceForDate,
  calendarYmdInTz,
  getPresentAbsenceSettings,
  readStationTimeZone
} from '@/lib/present-absence'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** GET ?date=YYYY-MM-DD — present/absence rows for roster that day (station TZ). */
export async function GET(request: NextRequest) {
  try {
    const tz = await readStationTimeZone()
    const raw = request.nextUrl.searchParams.get('date')?.trim()
    const dateYmd =
      raw && DATE_RE.test(raw) ? raw : calendarYmdInTz(new Date(), tz)

    const settings = await getPresentAbsenceSettings()
    if (!settings.enabled) {
      return NextResponse.json({
        enabled: false,
        date: dateYmd,
        stationTimeZone: tz,
        rows: []
      })
    }

    const built = await buildPresenceForDate({
      dateYmd,
      tz,
      graceMinutes: settings.graceMinutes
    })

    const byStaff = new Map<string, (typeof built.scheduled)[0]>()
    for (const s of built.scheduled) {
      if (!byStaff.has(s.staffId)) byStaff.set(s.staffId, s)
    }
    const rows = [...byStaff.entries()].map(([staffId, s]) => {
      const p = built.presenceByStaffId[staffId]
      return {
        staffId,
        staffName: s.staffName,
        staffFirstName: s.staffFirstName,
        shiftName: s.shiftName,
        shiftColor: s.shiftColor,
        shiftStartTime: s.shiftStartTime,
        status: p?.status ?? 'pending',
        lateReason: p?.lateReason ?? '',
        graceEndsAt: p?.graceEndsAtIso ?? null,
        isExpected: p?.isExpected ?? true,
        manualPresent: p?.manualPresent ?? false,
        manualAbsent: p?.manualAbsent ?? false,
        punchExempt: p?.punchExempt ?? false
      }
    })

    return NextResponse.json({
      enabled: true,
      date: dateYmd,
      stationTimeZone: tz,
      todayYmd: built.todayYmd,
      graceMinutes: settings.graceMinutes,
      rows
    })
  } catch (e) {
    console.error('present-absence GET', e)
    return NextResponse.json({ error: 'Failed to load present/absence' }, { status: 500 })
  }
}
