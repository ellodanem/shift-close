import { hoursFromPunchSequence, ymdInZone } from '@/lib/attendance-summary-data'
import {
  computeAttendancePunchDayStatuses,
  parseExpectedPunchesPerDay,
  type PunchForIrregularity
} from '@/lib/attendance-irregularity'
import {
  addCalendarDaysYmd,
  businessTodayYmd,
  formatDateOnlyForDisplay,
  isYmd,
  zonedEndExclusiveUtc,
  zonedStartOfDayUtc
} from '@/lib/datetime-policy'
import { deviceUserIdsMatch, expandDeviceUserIdsForDbMatch } from '@/lib/device-user-id'
import { prisma } from '@/lib/prisma'
import { readStationTimeZone } from '@/lib/present-absence'
import { formatAppUserDisplayName } from '@/lib/roles'

/** Max inclusive span for one report (safety). */
export const STAFF_ATTENDANCE_REPORT_MAX_DAYS = 93

export type StaffAttendanceDayStatus = 'present' | 'absent' | 'excused' | 'off' | 'pending'

export type StaffAttendancePunchQuality = 'full' | 'short_ok' | 'irregular'

export interface StaffAttendanceReportPunch {
  timeLabel: string
  punchType: 'in' | 'out'
  punchTimeIso: string
}

export interface StaffAttendanceReportCallOut {
  calledAt: string
  notes: string
  recordedByLabel: string | null
  /** Sick leave also covers this work date (tooltip hint). */
  sickLeaveOverlap: boolean
}

export interface StaffAttendanceReportDay {
  dateYmd: string
  dateLabel: string
  status: StaffAttendanceDayStatus
  statusNote: string
  callOut: StaffAttendanceReportCallOut | null
  shiftName: string | null
  punches: StaffAttendanceReportPunch[]
  hours: number
  punchQuality: StaffAttendancePunchQuality | null
  /** Punches on this day not shown or counted (after the first N by time). */
  excludedPunchCount: number
}

export interface StaffAttendanceReport {
  staffId: string
  staffName: string
  punchExempt: boolean
  startDate: string
  endDate: string
  periodLabel: string
  timeZone: string
  periodTotalHours: number
  /** From Attendance settings — only the first N punches per day are used on this report. */
  expectedPunchesPerDay: number
  days: StaffAttendanceReportDay[]
}

/**
 * Staff attendance report only: earliest punches up to `maxPunches` (expected punches / day setting).
 */
export function selectPunchesForStaffReport<T extends { punchTime: Date }>(
  dayLogs: T[],
  maxPunches: number
): { counted: T[]; excludedCount: number } {
  if (dayLogs.length === 0) return { counted: [], excludedCount: 0 }
  const sorted = [...dayLogs].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
  const counted = sorted.slice(0, maxPunches)
  return { counted, excludedCount: Math.max(0, sorted.length - counted.length) }
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

function isDateInVacation(
  ymd: string,
  vacationStart: string | null,
  vacationEnd: string | null
): boolean {
  if (!vacationStart || !vacationEnd) return false
  return vacationStart <= ymd && vacationEnd >= ymd
}

function formatPunchTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(d)
}

function logBelongsToStaff(
  log: { staffId: string | null; deviceUserId: string },
  staffId: string,
  deviceUserId: string | null
): boolean {
  if (log.staffId && log.staffId === staffId) return true
  const dev = deviceUserId?.trim()
  return Boolean(dev && deviceUserIdsMatch(log.deviceUserId, dev))
}

export function resolveStaffAttendanceDayStatus(params: {
  dateYmd: string
  todayYmd: string
  isScheduled: boolean
  isRosterOff: boolean
  excusedNote: string | null
  hasPunch: boolean
  manualPresent: boolean
  manualAbsent: boolean
  punchExempt: boolean
}): { status: StaffAttendanceDayStatus; statusNote: string } {
  const {
    dateYmd,
    todayYmd,
    isScheduled,
    isRosterOff,
    excusedNote,
    hasPunch,
    manualPresent,
    manualAbsent,
    punchExempt
  } = params

  if (excusedNote) {
    return { status: 'excused', statusNote: excusedNote }
  }

  if (isRosterOff || (!isScheduled && !hasPunch && !manualPresent)) {
    if (hasPunch || manualPresent) {
      return { status: 'present', statusNote: isRosterOff ? 'Worked (roster off)' : 'Worked (not on roster)' }
    }
    return { status: 'off', statusNote: isRosterOff ? 'Roster off' : 'Not on roster' }
  }

  if (!isScheduled && (hasPunch || manualPresent)) {
    return { status: 'present', statusNote: 'Worked (not on roster)' }
  }

  if (!isScheduled) {
    return { status: 'off', statusNote: 'Not on roster' }
  }

  if (punchExempt) {
    if (manualAbsent) return { status: 'absent', statusNote: 'Marked absent (no clock)' }
    return { status: 'present', statusNote: 'No clock required' }
  }

  if (manualPresent) return { status: 'present', statusNote: 'Marked present' }
  if (hasPunch) return { status: 'present', statusNote: '' }

  if (dateYmd > todayYmd) {
    return { status: 'pending', statusNote: 'Future date' }
  }
  if (dateYmd === todayYmd) {
    return { status: 'pending', statusNote: 'Scheduled — no punch yet today' }
  }

  return { status: 'absent', statusNote: 'Scheduled — no punch' }
}

export async function buildStaffAttendanceReport(params: {
  staffId: string
  startDate: string
  endDate: string
  timeZone?: string
  expectedPunchesPerDay?: number
}): Promise<StaffAttendanceReport> {
  const { staffId, startDate, endDate } = params
  if (!isYmd(startDate) || !isYmd(endDate)) {
    throw new Error('Invalid date format (use YYYY-MM-DD)')
  }
  if (startDate > endDate) {
    throw new Error('startDate must be on or before endDate')
  }

  const tz = params.timeZone ?? (await readStationTimeZone())
  const dates = enumerateYmdInclusive(startDate, endDate, tz)
  if (dates.length > STAFF_ATTENDANCE_REPORT_MAX_DAYS) {
    throw new Error(`Date range too long (max ${STAFF_ATTENDANCE_REPORT_MAX_DAYS} days)`)
  }

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      name: true,
      deviceUserId: true,
      punchExempt: true,
      vacationStart: true,
      vacationEnd: true
    }
  })
  if (!staff) {
    throw new Error('Staff not found')
  }

  const {
    name: staffFullName,
    deviceUserId,
    punchExempt,
    vacationStart,
    vacationEnd
  } = staff

  const staffName = staffFullName.trim()
  const todayYmd = businessTodayYmd()

  const windowStart = zonedStartOfDayUtc(startDate, tz)
  const windowEndExclusive = zonedEndExclusiveUtc(endDate, tz)

  const devKeys = deviceUserId?.trim()
    ? expandDeviceUserIdsForDbMatch([deviceUserId])
    : []

  const logOr: Array<{ staffId: string } | { deviceUserId: { in: string[] } }> = [{ staffId }]
  if (devKeys.length) logOr.push({ deviceUserId: { in: devKeys } })

  const [logs, rosterEntries, overrides, sickLeaves, dayOffs, callOutRows, settingsRow] =
    await Promise.all([
    prisma.attendanceLog.findMany({
      where: {
        punchTime: { gte: windowStart, lt: windowEndExclusive },
        OR: logOr
      },
      orderBy: { punchTime: 'asc' },
      select: {
        id: true,
        staffId: true,
        deviceUserId: true,
        punchTime: true,
        punchType: true
      }
    }),
    prisma.rosterEntry.findMany({
      where: { staffId, date: { gte: startDate, lte: endDate } },
      include: { shiftTemplate: { select: { name: true } } }
    }),
    prisma.attendanceDayOverride.findMany({
      where: { staffId, date: { gte: startDate, lte: endDate } }
    }),
    prisma.staffSickLeave.findMany({
      where: {
        staffId,
        status: 'approved',
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      },
      select: { startDate: true, endDate: true }
    }),
    prisma.staffDayOff.findMany({
      where: { staffId, date: { gte: startDate, lte: endDate }, status: 'approved' },
      select: { date: true, reason: true }
    }),
    prisma.staffCallOut.findMany({
      where: { staffId, date: { gte: startDate, lte: endDate } },
      include: {
        recordedBy: {
          select: { id: true, username: true, firstName: true, lastName: true }
        }
      }
    }),
    prisma.appSettings.findUnique({ where: { key: 'attendance_expected_punches_per_day' } })
  ])

  const expectedPunches =
    params.expectedPunchesPerDay ?? parseExpectedPunchesPerDay(settingsRow?.value)

  const rosterByDate = new Map(
    rosterEntries.map((e) => [
      e.date,
      {
        isScheduled: e.shiftTemplateId != null,
        isRosterOff: e.shiftTemplateId == null,
        shiftName: e.shiftTemplate?.name ?? null
      }
    ])
  )

  const overrideByDate = new Map(
    overrides.map((o) => [
      o.date,
      { manualPresent: o.manualPresent, manualAbsent: o.manualAbsent, lateReason: o.lateReason ?? '' }
    ])
  )

  const dayOffByDate = new Map(dayOffs.map((d) => [d.date, d.reason ?? 'Day off']))

  const callOutByDate = new Map(
    callOutRows.map((c) => [
      c.date,
      {
        calledAt: c.calledAt.toISOString(),
        notes: c.notes,
        recordedByLabel: c.recordedBy ? formatAppUserDisplayName(c.recordedBy) : null
      }
    ])
  )

  function isOnSickLeave(ymd: string): boolean {
    return sickLeaves.some((sl) => sl.startDate <= ymd && sl.endDate >= ymd)
  }

  function excusedNoteFor(ymd: string): string | null {
    if (isDateInVacation(ymd, vacationStart, vacationEnd)) return 'Vacation'
    for (const sl of sickLeaves) {
      if (sl.startDate <= ymd && sl.endDate >= ymd) return 'Sick leave'
    }
    if (dayOffByDate.has(ymd)) {
      const r = dayOffByDate.get(ymd)!
      return r.trim() ? `Day off: ${r}` : 'Day off'
    }
    return null
  }

  const punchesByDate = new Map<string, typeof logs>()
  for (const log of logs) {
    if (!logBelongsToStaff(log, staffId, deviceUserId)) continue
    const day = ymdInZone(log.punchTime, tz)
    if (!punchesByDate.has(day)) punchesByDate.set(day, [])
    punchesByDate.get(day)!.push(log)
  }

  const days: StaffAttendanceReportDay[] = []
  let periodTotalHours = 0

  for (const dateYmd of dates) {
    const dayLogs = punchesByDate.get(dateYmd) ?? []
    const { counted: countedLogs, excludedCount } = selectPunchesForStaffReport(
      dayLogs,
      expectedPunches
    )
    const roster = rosterByDate.get(dateYmd)
    const isScheduled = roster?.isScheduled === true
    const isRosterOff = roster?.isRosterOff === true
    const ov = overrideByDate.get(dateYmd)
    const hasPunch = dayLogs.length > 0

    const { status, statusNote: baseNote } = resolveStaffAttendanceDayStatus({
      dateYmd,
      todayYmd,
      isScheduled,
      isRosterOff: Boolean(isRosterOff),
      excusedNote: excusedNoteFor(dateYmd),
      hasPunch,
      manualPresent: ov?.manualPresent === true,
      manualAbsent: ov?.manualAbsent === true,
      punchExempt
    })

    const punchSeq = countedLogs.map((l) => ({ punchTime: l.punchTime, punchType: l.punchType }))
    const hours = punchExempt ? 0 : hoursFromPunchSequence(punchSeq)
    periodTotalHours += hours

    let punchQuality: StaffAttendancePunchQuality | null = null
    if (countedLogs.length > 0 && !punchExempt) {
      const forIrreg: PunchForIrregularity[] = countedLogs.map((l) => ({
        id: l.id,
        staffId,
        deviceUserId: l.deviceUserId,
        punchTime: l.punchTime,
        punchType: l.punchType
      }))
      const statusMap = computeAttendancePunchDayStatuses(forIrreg, expectedPunches, (t) =>
        ymdInZone(t, tz)
      )
      const first = countedLogs[0]!
      punchQuality = statusMap.get(first.id) ?? 'irregular'
    }

    const lateReason = ov?.lateReason?.trim()
    let statusNote =
      lateReason && (status === 'present' || status === 'absent')
        ? `${baseNote}${baseNote ? ' — ' : ''}${lateReason}`
        : baseNote
    if (excludedCount > 0) {
      const extra =
        excludedCount === 1
          ? '1 later punch not shown in report'
          : `${excludedCount} later punches not shown in report`
      statusNote = statusNote ? `${statusNote} — ${extra}` : extra
    }

    const callOutRow = callOutByDate.get(dateYmd)
    const callOut = callOutRow
      ? { ...callOutRow, sickLeaveOverlap: isOnSickLeave(dateYmd) }
      : null

    days.push({
      dateYmd,
      dateLabel: formatDateOnlyForDisplay(dateYmd),
      status,
      statusNote,
      callOut,
      shiftName: roster?.shiftName ?? null,
      punches: countedLogs.map((l) => ({
        timeLabel: formatPunchTime(l.punchTime, tz),
        punchType: l.punchType === 'out' ? 'out' : 'in',
        punchTimeIso: l.punchTime.toISOString()
      })),
      hours: Math.round(hours * 100) / 100,
      punchQuality,
      excludedPunchCount: excludedCount
    })
  }

  periodTotalHours = Math.round(periodTotalHours * 100) / 100

  const periodLabel =
    startDate === endDate ? startDate : `${startDate} → ${endDate}`

  return {
    staffId,
    staffName,
    punchExempt,
    startDate,
    endDate,
    periodLabel,
    timeZone: tz,
    periodTotalHours,
    expectedPunchesPerDay: expectedPunches,
    days
  }
}
