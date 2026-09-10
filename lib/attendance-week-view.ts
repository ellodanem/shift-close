import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { hoursFromPunchSequence } from '@/lib/attendance-summary-data'
import {
  computeAttendancePunchDayStatuses,
  parseExpectedPunchesPerDay,
  utcCalendarDayKey,
  type PunchDayStatus
} from '@/lib/attendance-irregularity'
import { deviceUserIdLookupKeys, expandDeviceUserIdsForDbMatch } from '@/lib/device-user-id'
import { prisma } from '@/lib/prisma'
import {
  addCalendarYmd,
  calendarYmdInTz,
  computePresenceStatus,
  getPresentAbsenceSettings,
  loadOverridesForDates,
  loadPunchFlagsForStaffWeek,
  mondayOfWeekYmd,
  readStationTimeZone
} from '@/lib/present-absence'
import { ROSTER_WEEK_TARGET_HOURS } from '@/lib/roster-pay-period-hours'
import { displayStaffForWeek, type RosterStaffClient } from '@/lib/roster-week-client'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type WeekViewCellKind =
  | 'present'
  | 'late'
  | 'absent'
  | 'pending'
  | 'no_shift'
  | 'vacation'
  | 'day_off'
  | 'sick'
  | 'excused'

export interface AttendanceWeekViewPunch {
  time: string
  type: 'in' | 'out' | 'other'
  late?: boolean
}

export interface AttendanceWeekViewCell {
  date: string
  kind: WeekViewCellKind
  shiftName: string | null
  shiftColor: string | null
  punches: AttendanceWeekViewPunch[]
  punchQuality: PunchDayStatus | null
  note?: string
}

export interface AttendanceWeekViewStaffRow {
  staffId: string
  staffName: string
  staffFirstName: string
  role: string
  status: string
  cells: AttendanceWeekViewCell[]
  weekWorkedHours: number
  otAlert: boolean
  irregularDayCount: number
}

export interface AttendanceWeekViewPayload {
  enabled: boolean
  weekStart: string
  weekDates: string[]
  todayYmd: string
  stationTimeZone: string
  lateMinutes: number
  absentMinutes: number
  irregularityCount: number
  otAlertCount: number
  staff: AttendanceWeekViewStaffRow[]
}

function isShiftRequestDayOff(reason: string | null | undefined): boolean {
  return (reason ?? '').trim().startsWith('SHIFT_REQUEST:')
}

function firstNameOf(s: { name: string; firstName: string | null }): string {
  return (s.firstName && s.firstName.trim()) || s.name.split(' ')[0] || s.name
}

export async function buildAttendanceWeekView(weekStartRaw: string): Promise<AttendanceWeekViewPayload> {
  const tz = await readStationTimeZone()
  const settings = await getPresentAbsenceSettings()
  const todayYmd = calendarYmdInTz(new Date(), tz)
  const weekStart = DATE_RE.test(weekStartRaw) ? mondayOfWeekYmd(weekStartRaw, tz) : mondayOfWeekYmd(todayYmd, tz)
  const weekDates = Array.from({ length: 7 }, (_, i) => addCalendarYmd(weekStart, i, tz))
  const weekEnd = weekDates[6]!

  if (!settings.enabled) {
    return {
      enabled: false,
      weekStart,
      weekDates,
      todayYmd,
      stationTimeZone: tz,
      lateMinutes: settings.lateMinutes,
      absentMinutes: settings.absentMinutes,
      irregularityCount: 0,
      otAlertCount: 0,
      staff: []
    }
  }

  const expectedRow = await prisma.appSettings.findUnique({
    where: { key: 'attendance_expected_punches_per_day' }
  })
  const expectedPunches = parseExpectedPunchesPerDay(expectedRow?.value)

  const [staffRows, week, vacationStaff, sickLeaves, dayOffs, callOuts] = await Promise.all([
    prisma.staff.findMany({
      select: {
        id: true,
        name: true,
        firstName: true,
        status: true,
        role: true,
        startDate: true,
        vacationStart: true,
        vacationEnd: true,
        punchExempt: true,
        deviceUserId: true
      }
    }),
    prisma.rosterWeek.findFirst({
      where: { weekStart },
      include: {
        entries: {
          include: {
            shiftTemplate: { select: { name: true, color: true, startTime: true } }
          }
        }
      }
    }),
    prisma.staff.findMany({
      where: {
        vacationStart: { not: null },
        vacationEnd: { not: null },
        AND: [{ vacationStart: { lte: weekEnd } }, { vacationEnd: { gte: weekStart } }]
      },
      select: { id: true, vacationStart: true, vacationEnd: true }
    }),
    prisma.staffSickLeave.findMany({
      where: {
        status: { not: 'denied' },
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart }
      },
      select: { staffId: true, startDate: true, endDate: true }
    }),
    prisma.staffDayOff.findMany({
      where: { date: { gte: weekStart, lte: weekEnd }, status: 'approved' },
      select: { staffId: true, date: true, reason: true }
    }),
    prisma.staffCallOut.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      select: { staffId: true, date: true }
    })
  ])

  const entries = week?.entries ?? []
  const rosterStaff: RosterStaffClient[] = staffRows.map((s) => ({
    id: s.id,
    name: s.name,
    firstName: s.firstName ?? undefined,
    status: s.status,
    role: s.role,
    startDate: s.startDate,
    vacationStart: s.vacationStart,
    vacationEnd: s.vacationEnd
  }))
  const display = displayStaffForWeek(
    rosterStaff,
    weekStart,
    entries.map((e) => ({
      staffId: e.staffId,
      date: e.date,
      shiftTemplateId: e.shiftTemplateId
    }))
  )

  const staffIds = display.map((s) => s.id)
  const punchExemptById = new Map(staffRows.map((s) => [s.id, s.punchExempt === true]))
  const deviceToStaff = new Map<string, string>()
  for (const s of staffRows) {
    if (!s.deviceUserId?.trim()) continue
    for (const k of deviceUserIdLookupKeys(s.deviceUserId.trim())) {
      deviceToStaff.set(k, s.id)
    }
  }

  const vacationByStaff = new Map(vacationStaff.map((s) => [s.id, s]))
  const sickByStaff = new Map<string, { startDate: string; endDate: string }[]>()
  for (const row of sickLeaves) {
    const list = sickByStaff.get(row.staffId) ?? []
    list.push({ startDate: row.startDate, endDate: row.endDate })
    sickByStaff.set(row.staffId, list)
  }
  const dayOffSet = new Set(
    dayOffs.filter((d) => !isShiftRequestDayOff(d.reason)).map((d) => `${d.staffId}|${d.date}`)
  )
  const callOutSet = new Set(callOuts.map((c) => `${c.staffId}|${c.date}`))

  const entryByStaffDate = new Map<string, (typeof entries)[number]>()
  for (const e of entries) {
    entryByStaffDate.set(`${e.staffId}|${e.date}`, e)
  }

  const windowStart = fromZonedTime(`${weekStart}T00:00:00`, tz)
  const windowEndExclusive = fromZonedTime(`${addCalendarYmd(weekEnd, 1, tz)}T00:00:00`, tz)
  const deviceIds = expandDeviceUserIdsForDbMatch(
    staffRows.map((s) => s.deviceUserId).filter((d): d is string => Boolean(d && d.trim()))
  )
  const orClause: Array<{ staffId?: { in: string[] }; deviceUserId?: { in: string[] } }> = []
  if (staffIds.length) orClause.push({ staffId: { in: staffIds } })
  if (deviceIds.length) orClause.push({ deviceUserId: { in: deviceIds } })

  const logs =
    orClause.length === 0
      ? []
      : await prisma.attendanceLog.findMany({
          where: {
            punchTime: { gte: windowStart, lt: windowEndExclusive },
            OR: orClause
          },
          select: { id: true, staffId: true, deviceUserId: true, punchTime: true, punchType: true }
        })

  const resolveStaffId = (staffId: string | null, deviceUserId: string): string | null => {
    if (staffId && staffIds.includes(staffId)) return staffId
    for (const k of deviceUserIdLookupKeys(deviceUserId)) {
      const sid = deviceToStaff.get(k)
      if (sid && staffIds.includes(sid)) return sid
    }
    return null
  }

  const punchesByStaffDate = new Map<string, Array<{ punchTime: Date; punchType: string }>>()
  for (const log of logs) {
    const sid = resolveStaffId(log.staffId, log.deviceUserId)
    if (!sid) continue
    const day = calendarYmdInTz(log.punchTime, tz)
    const key = `${sid}|${day}`
    const list = punchesByStaffDate.get(key) ?? []
    list.push({ punchTime: log.punchTime, punchType: log.punchType })
    punchesByStaffDate.set(key, list)
  }

  const irregMap = computeAttendancePunchDayStatuses(
    logs.map((l) => ({
      id: l.id,
      staffId: l.staffId,
      deviceUserId: l.deviceUserId,
      punchTime: l.punchTime,
      punchType: l.punchType
    })),
    expectedPunches,
    utcCalendarDayKey
  )
  const irregularDays = new Set<string>()
  const qualityByStaffDate = new Map<string, PunchDayStatus>()
  for (const log of logs) {
    const sid = resolveStaffId(log.staffId, log.deviceUserId)
    if (!sid) continue
    const day = utcCalendarDayKey(log.punchTime)
    const q = irregMap.get(log.id)
    if (!q) continue
    qualityByStaffDate.set(`${sid}|${day}`, q)
    if (q === 'irregular') irregularDays.add(`${sid}|${day}`)
  }

  const [punchByDate, overrideByDate] = await Promise.all([
    loadPunchFlagsForStaffWeek(staffIds, weekDates, tz),
    loadOverridesForDates(staffIds, weekDates)
  ])

  const now = new Date()
  const staffOut: AttendanceWeekViewStaffRow[] = []

  for (const s of display) {
    const src = staffRows.find((r) => r.id === s.id)
    const cells: AttendanceWeekViewCell[] = []
    let weekHours = 0
    let irregularDayCount = 0

    for (const date of weekDates) {
      const key = `${s.id}|${date}`
      const vac = vacationByStaff.get(s.id)
      const onVacation = Boolean(vac?.vacationStart && vac.vacationEnd && date >= vac.vacationStart && date <= vac.vacationEnd)
      const onSick = (sickByStaff.get(s.id) ?? []).some((sl) => date >= sl.startDate && date <= sl.endDate)
      const onDayOff = dayOffSet.has(key)
      const onCallOut = callOutSet.has(key)
      const entry = entryByStaffDate.get(key)
      const shift = entry?.shiftTemplate ?? null
      const hasShift = Boolean(entry?.shiftTemplateId && shift)
      const dayPunches = (punchesByStaffDate.get(key) ?? []).sort(
        (a, b) => a.punchTime.getTime() - b.punchTime.getTime()
      )
      weekHours += hoursFromPunchSequence(dayPunches)
      const punchQuality = qualityByStaffDate.get(key) ?? null
      if (punchQuality === 'irregular') irregularDayCount += 1

      let kind: WeekViewCellKind
      let note: string | undefined
      if (onVacation) {
        kind = 'vacation'
      } else if (onSick) {
        kind = 'sick'
      } else if (onDayOff) {
        kind = 'day_off'
      } else if (onCallOut && !hasShift) {
        kind = 'excused'
        note = 'Call-out'
      } else if (!hasShift) {
        kind = 'no_shift'
      } else {
        const firstPunchAt = punchByDate.get(date)?.get(s.id) ?? null
        const ov = overrideByDate.get(date)?.get(s.id)
        const status = computePresenceStatus({
          dateYmd: date,
          todayYmd,
          now,
          lateMinutes: settings.lateMinutes,
          absentMinutes: settings.absentMinutes,
          shiftStartHHmm: shift?.startTime ?? '06:00',
          tz,
          firstPunchAt,
          manualPresent: ov?.manualPresent === true,
          isExpected: true,
          punchExempt: punchExemptById.get(s.id) === true,
          manualAbsent: ov?.manualAbsent === true
        })
        kind = status === 'off' ? 'no_shift' : status
        if (onCallOut) note = 'Call-out'
      }

      const punches: AttendanceWeekViewPunch[] = dayPunches.map((p) => {
        const typeRaw = String(p.punchType ?? '').toLowerCase()
        const type: AttendanceWeekViewPunch['type'] =
          typeRaw === 'in' ? 'in' : typeRaw === 'out' ? 'out' : 'other'
        return {
          time: formatInTimeZone(p.punchTime, tz, 'HH:mm'),
          type,
          late: kind === 'late' && type === 'in' ? true : undefined
        }
      })

      cells.push({
        date,
        kind,
        shiftName: shift?.name ?? null,
        shiftColor: shift?.color ?? null,
        punches,
        punchQuality,
        note
      })
    }

    staffOut.push({
      staffId: s.id,
      staffName: src?.name ?? s.name,
      staffFirstName: src ? firstNameOf(src) : s.firstName || s.name,
      role: src?.role ?? s.role,
      status: src?.status ?? s.status,
      cells,
      weekWorkedHours: Math.round(weekHours * 100) / 100,
      otAlert: weekHours > ROSTER_WEEK_TARGET_HOURS,
      irregularDayCount
    })
  }

  const irregularityCount = new Set(
    [...irregularDays].filter((k) => staffIds.includes(k.split('|')[0] ?? ''))
  ).size
  const otAlertCount = staffOut.filter((r) => r.otAlert).length

  return {
    enabled: true,
    weekStart,
    weekDates,
    todayYmd,
    stationTimeZone: tz,
    lateMinutes: settings.lateMinutes,
    absentMinutes: settings.absentMinutes,
    irregularityCount,
    otAlertCount,
    staff: staffOut
  }
}
