import { NextResponse } from 'next/server'
import {
  buildPresenceForDate,
  calendarYmdInTz,
  getPresentAbsenceSettings,
  loadRosterForCalendarYmd,
  readStationTimeZone
} from '@/lib/present-absence'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tz = await readStationTimeZone()
    const now = new Date()
    const todayYmd = calendarYmdInTz(now, tz)
    const settings = await getPresentAbsenceSettings()

    if (!settings.enabled) {
      const roster = await loadRosterForCalendarYmd(todayYmd, tz)
      return NextResponse.json({
        date: todayYmd,
        weekStart: roster.weekStart,
        stationTimeZone: tz,
        scheduled: roster.scheduled.map((s) => ({
          staffId: s.staffId,
          staffName: s.staffName,
          staffFirstName: s.staffFirstName,
          shiftName: s.shiftName,
          shiftColor: s.shiftColor,
          shiftStartTime: s.shiftStartTime
        })),
        onVacation: roster.onVacation,
        off: roster.off,
        presentAbsenceEnabled: false
      })
    }

    const built = await buildPresenceForDate({
      dateYmd: todayYmd,
      tz,
      now,
      graceMinutes: settings.graceMinutes
    })

    const scheduled = built.scheduled.map((s) => {
      const p = built.presenceByStaffId[s.staffId]
      return {
        staffId: s.staffId,
        staffName: s.staffName,
        staffFirstName: s.staffFirstName,
        shiftName: s.shiftName,
        shiftColor: s.shiftColor,
        shiftStartTime: s.shiftStartTime,
        presence: p
          ? {
              status: p.status,
              lateReason: p.lateReason,
              graceEndsAt: p.graceEndsAtIso ?? null,
              isExpected: p.isExpected,
              manualPresent: p.manualPresent,
              manualAbsent: p.manualAbsent,
              punchExempt: p.punchExempt
            }
          : undefined
      }
    })

    return NextResponse.json({
      date: todayYmd,
      weekStart: built.weekStart,
      stationTimeZone: tz,
      scheduled,
      onVacation: built.onVacation,
      off: built.off,
      presentAbsenceEnabled: true,
      presentAbsenceGraceMinutes: settings.graceMinutes
    })
  } catch (error) {
    console.error('Error fetching dashboard today:', error)
    return NextResponse.json({ error: "Failed to fetch today's roster" }, { status: 500 })
  }
}
