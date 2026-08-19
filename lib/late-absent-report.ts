import { formatInTimeZone } from 'date-fns-tz'
import {
  addCalendarDaysYmd,
  BUSINESS_TIME_ZONE,
  formatDateOnlyForDisplay,
  isYmd,
  zonedEndExclusiveUtc,
  zonedStartOfDayUtc
} from '@/lib/datetime-policy'
import { deviceUserIdLookupKeys, expandDeviceUserIdsForDbMatch } from '@/lib/device-user-id'
import { prisma } from '@/lib/prisma'
import {
  clampLateAbsentMinutes,
  computePresenceStatus,
  getPresentAbsenceSettings,
  shiftStartInstantOnDate
} from '@/lib/present-absence'
import { STAFF_ATTENDANCE_REPORT_MAX_DAYS } from '@/lib/staff-attendance-report'
import type {
  LateAbsentDayRow,
  LateAbsentDayStatus,
  LateAbsentReport,
  LateAbsentStaffRow
} from '@/lib/late-absent-report-shared'

export const LATE_ABSENT_REPORT_MAX_DAYS = STAFF_ATTENDANCE_REPORT_MAX_DAYS
export type { LateAbsentDayRow, LateAbsentDayStatus, LateAbsentReport, LateAbsentStaffRow } from '@/lib/late-absent-report-shared'

function isShiftRequestDayOff(reason: string | null | undefined): boolean {
  return (reason ?? '').trim().startsWith('SHIFT_REQUEST:')
}

function enumerateYmdInclusive(startYmd: string, endYmd: string, tz: string): string[] {
  const out: string[] = []
  let cur = startYmd
  while (cur <= endYmd) {
    out.push(cur)
    cur = addCalendarDaysYmd(cur, 1, tz)
  }
  return out
}

function formatPunchLabel(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, 'h:mm a')
}

export async function buildLateAbsentReport(params: {
  startDate: string
  endDate: string
  now?: Date
}): Promise<LateAbsentReport> {
  const { startDate, endDate } = params
  if (!isYmd(startDate) || !isYmd(endDate)) {
    throw new Error('Invalid date format (use YYYY-MM-DD)')
  }
  if (startDate > endDate) {
    throw new Error('startDate must be on or before endDate')
  }

  const tz = BUSINESS_TIME_ZONE
  const dates = enumerateYmdInclusive(startDate, endDate, tz)
  if (dates.length > LATE_ABSENT_REPORT_MAX_DAYS) {
    throw new Error(`Date range too long (max ${LATE_ABSENT_REPORT_MAX_DAYS} days)`)
  }

  const now = params.now ?? new Date()
  const todayYmd = formatInTimeZone(now, tz, 'yyyy-MM-dd')
  const settings = await getPresentAbsenceSettings()
  const { lateMinutes, absentMinutes } = clampLateAbsentMinutes(
    settings.lateMinutes,
    settings.absentMinutes
  )

  const windowStart = zonedStartOfDayUtc(startDate, tz)
  const windowEndExclusive = zonedEndExclusiveUtc(endDate, tz)

  const rosterEntries = await prisma.rosterEntry.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      shiftTemplateId: { not: null },
      staff: { status: 'active' }
    },
    include: {
      staff: {
        select: {
          id: true,
          name: true,
          firstName: true,
          deviceUserId: true,
          punchExempt: true,
          vacationStart: true,
          vacationEnd: true
        }
      },
      shiftTemplate: { select: { name: true, startTime: true, endTime: true } }
    }
  })

  const staffById = new Map<
    string,
    {
      name: string
      deviceUserId: string | null
      punchExempt: boolean
    }
  >()
  for (const e of rosterEntries) {
    if (!staffById.has(e.staff.id)) {
      staffById.set(e.staff.id, {
        name: e.staff.name,
        deviceUserId: e.staff.deviceUserId,
        punchExempt: e.staff.punchExempt
      })
    }
  }

  const staffIds = [...staffById.keys()]
  const staffIdSet = new Set(staffIds)
  const deviceIds = expandDeviceUserIdsForDbMatch(
    [...staffById.values()].map((s) => s.deviceUserId).filter((d): d is string => Boolean(d && d.trim()))
  )

  const logOr: Array<{ staffId?: { in: string[] }; deviceUserId?: { in: string[] } }> = []
  if (staffIds.length) logOr.push({ staffId: { in: staffIds } })
  if (deviceIds.length) logOr.push({ deviceUserId: { in: deviceIds } })

  const [vacationStaff, sickLeaves, dayOffs, callOuts, overrides, logs] = await Promise.all([
    staffIds.length === 0
      ? Promise.resolve([])
      : prisma.staff.findMany({
          where: {
            id: { in: staffIds },
            vacationStart: { not: null },
            vacationEnd: { not: null },
            AND: [{ vacationStart: { lte: endDate } }, { vacationEnd: { gte: startDate } }]
          },
          select: { id: true, vacationStart: true, vacationEnd: true }
        }),
    staffIds.length === 0
      ? Promise.resolve([])
      : prisma.staffSickLeave.findMany({
          where: {
            staffId: { in: staffIds },
            status: { not: 'denied' },
            startDate: { lte: endDate },
            endDate: { gte: startDate }
          },
          select: { staffId: true, startDate: true, endDate: true }
        }),
    staffIds.length === 0
      ? Promise.resolve([])
      : prisma.staffDayOff.findMany({
          where: { staffId: { in: staffIds }, date: { gte: startDate, lte: endDate }, status: 'approved' },
          select: { staffId: true, date: true, reason: true }
        }),
    staffIds.length === 0
      ? Promise.resolve([])
      : prisma.staffCallOut.findMany({
          where: { staffId: { in: staffIds }, date: { gte: startDate, lte: endDate } },
          select: { staffId: true, date: true }
        }),
    staffIds.length === 0
      ? Promise.resolve([])
      : prisma.attendanceDayOverride.findMany({
          where: { staffId: { in: staffIds }, date: { gte: startDate, lte: endDate } },
          select: { staffId: true, date: true, manualPresent: true, manualAbsent: true, lateReason: true }
        }),
    logOr.length === 0
      ? Promise.resolve([])
      : prisma.attendanceLog.findMany({
          where: {
            punchTime: { gte: windowStart, lt: windowEndExclusive },
            OR: logOr
          },
          select: { staffId: true, deviceUserId: true, punchTime: true }
        })
  ])

  const vacationByStaff = new Map(
    vacationStaff.map((s) => [s.id, { start: s.vacationStart!, end: s.vacationEnd! }])
  )
  const excusedDayOff = new Set<string>()
  for (const d of dayOffs) {
    if (!isShiftRequestDayOff(d.reason)) excusedDayOff.add(`${d.staffId}|${d.date}`)
  }
  const callOutDays = new Set(callOuts.map((c) => `${c.staffId}|${c.date}`))
  const overrideByKey = new Map(
    overrides.map((o) => [
      `${o.staffId}|${o.date}`,
      {
        manualPresent: o.manualPresent,
        manualAbsent: o.manualAbsent,
        lateReason: o.lateReason ?? ''
      }
    ])
  )

  function isOnSickLeave(staffId: string, ymd: string): boolean {
    return sickLeaves.some((sl) => sl.staffId === staffId && sl.startDate <= ymd && sl.endDate >= ymd)
  }

  function excusedNote(staffId: string, ymd: string): string | null {
    const vac = vacationByStaff.get(staffId)
    if (vac && vac.start <= ymd && vac.end >= ymd) return 'Vacation'
    if (isOnSickLeave(staffId, ymd)) return 'Sick leave'
    if (excusedDayOff.has(`${staffId}|${ymd}`)) return 'Day off'
    if (callOutDays.has(`${staffId}|${ymd}`)) return 'Call-out'
    return null
  }

  const deviceToStaff = new Map<string, string>()
  for (const [id, s] of staffById) {
    if (!s.deviceUserId?.trim()) continue
    for (const k of deviceUserIdLookupKeys(s.deviceUserId.trim())) {
      deviceToStaff.set(k, id)
    }
  }

  const firstPunchByStaffDate = new Map<string, Date>()

  for (const log of logs) {
    let sid: string | null = log.staffId && staffIdSet.has(log.staffId) ? log.staffId : null
    if (!sid) {
      for (const k of deviceUserIdLookupKeys(log.deviceUserId)) {
        sid = deviceToStaff.get(k) ?? null
        if (sid) break
      }
    }
    if (!sid) continue
    const day = formatInTimeZone(log.punchTime, tz, 'yyyy-MM-dd')
    if (day < startDate || day > endDate) continue
    const key = `${sid}|${day}`
    const prev = firstPunchByStaffDate.get(key)
    if (!prev || log.punchTime < prev) firstPunchByStaffDate.set(key, log.punchTime)
  }

  const daysByStaff = new Map<string, LateAbsentDayRow[]>()
  for (const e of rosterEntries) {
    const staffId = e.staff.id
    const dateYmd = e.date
    const shiftStartTime = e.shiftTemplate?.startTime ?? '06:00'
    const shiftEndTime = e.shiftTemplate?.endTime ?? null
    const shiftName = e.shiftTemplate?.name ?? 'Shift'
    const key = `${staffId}|${dateYmd}`
    const noteExcused = excusedNote(staffId, dateYmd)
    const ov = overrideByKey.get(key)
    const firstPunchAt = firstPunchByStaffDate.get(key) ?? null
    const punchExempt = staffById.get(staffId)?.punchExempt === true

    let status: LateAbsentDayStatus
    let note = ov?.lateReason ?? ''
    if (noteExcused) {
      status = 'excused'
      note = noteExcused
    } else {
      status = computePresenceStatus({
        dateYmd,
        todayYmd,
        now,
        lateMinutes,
        absentMinutes,
        shiftStartHHmm: shiftStartTime,
        tz,
        firstPunchAt,
        manualPresent: ov?.manualPresent === true,
        isExpected: true,
        punchExempt,
        manualAbsent: ov?.manualAbsent === true
      })
    }

    const shiftStart = shiftStartInstantOnDate(dateYmd, shiftStartTime, tz)
    const minutesAfterStart =
      firstPunchAt != null
        ? Math.round((firstPunchAt.getTime() - shiftStart.getTime()) / 60000)
        : null

    const dayRow: LateAbsentDayRow = {
      dateYmd,
      dateLabel: formatDateOnlyForDisplay(dateYmd),
      shiftName,
      shiftStartTime,
      shiftEndTime,
      status,
      punchTimeIso: firstPunchAt?.toISOString() ?? null,
      punchTimeLabel: firstPunchAt ? formatPunchLabel(firstPunchAt, tz) : null,
      minutesAfterStart,
      note
    }

    if (!daysByStaff.has(staffId)) daysByStaff.set(staffId, [])
    daysByStaff.get(staffId)!.push(dayRow)
  }

  const rows: LateAbsentStaffRow[] = []
  for (const [staffId, days] of daysByStaff) {
    days.sort((a, b) => a.dateYmd.localeCompare(b.dateYmd))
    const lateDays = days.filter((d) => d.status === 'late')
    const absentDays = days.filter((d) => d.status === 'absent')
    const incidents = [...lateDays, ...absentDays].sort((a, b) => a.dateYmd.localeCompare(b.dateYmd))
    const last = incidents[incidents.length - 1]
    rows.push({
      staffId,
      staffName: staffById.get(staffId)?.name ?? staffId,
      lateCount: lateDays.length,
      absentCount: absentDays.length,
      total: lateDays.length + absentDays.length,
      lastIncidentYmd: last?.dateYmd ?? null,
      lastIncidentLabel: last
        ? `${last.dateLabel} ${last.status === 'late' ? 'late' : 'absent'}`
        : null,
      lastIncidentStatus: last ? (last.status === 'late' ? 'late' : 'absent') : null,
      days
    })
  }

  rows.sort((a, b) => b.total - a.total || a.staffName.localeCompare(b.staffName))
  const incidentRows = rows.filter((r) => r.total > 0)

  return {
    startDate,
    endDate,
    periodLabel: `${formatDateOnlyForDisplay(startDate)} – ${formatDateOnlyForDisplay(endDate)}`,
    timeZone: tz,
    lateMinutes,
    absentMinutes,
    lateTotal: incidentRows.reduce((n, r) => n + r.lateCount, 0),
    absentTotal: incidentRows.reduce((n, r) => n + r.absentCount, 0),
    staffWithIncidents: incidentRows.length,
    staffReviewed: rows.length,
    rows: incidentRows
  }
}
