import {
  addCalendarDaysYmd,
  formatDateOnlyForDisplay,
  isYmd,
  ymdToUtcNoonDate
} from '@/lib/datetime-policy'
import { mondayOfWeekYmd, readStationTimeZone } from '@/lib/present-absence'
import { prisma } from '@/lib/prisma'
import { addDays, ROSTER_DAY_LABELS } from '@/lib/roster-week-client'

/** Max inclusive span for one report (safety). */
export const STAFF_ROSTER_REPORT_MAX_DAYS = 93

export type StaffRosterDayStatus =
  | 'working'
  | 'off'
  | 'unassigned'
  | 'vacation'
  | 'sick'
  | 'day_off'
  | 'station_closed'

export type RosterWeekPublication = 'published' | 'draft' | 'missing'

export interface StaffRosterReportDay {
  dateYmd: string
  dateLabel: string
  dayShort: string
  dayNum: string
  status: StaffRosterDayStatus
  statusLabel: string
  statusNote: string
  shiftName: string | null
  shiftStart: string | null
  shiftEnd: string | null
  shiftColor: string | null
  position: string | null
  rosterNotes: string
  holidayName: string | null
  /** Roster shift when vacation/sick/day-off overlays a working assignment. */
  rosterShiftName: string | null
  weekStart: string
}

export interface StaffRosterReportWeek {
  weekStart: string
  weekEnd: string
  weekLabel: string
  rosterStatus: RosterWeekPublication
  days: StaffRosterReportDay[]
  summaryLine: string
}

export interface StaffRosterReportShiftSummary {
  key: string
  label: string
  count: number
  color: string | null
}

export interface StaffRosterReport {
  staffId: string
  staffName: string
  startDate: string
  endDate: string
  periodLabel: string
  timeZone: string
  publishedOnly: boolean
  scheduledShiftCount: number
  days: StaffRosterReportDay[]
  weeks: StaffRosterReportWeek[]
  shiftSummaries: StaffRosterReportShiftSummary[]
  periodSummaryLine: string
  weekendShiftCount: number
  lateCloseCount: number
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

function isShiftRequestDayOff(reason: string | null | undefined): boolean {
  return (reason ?? '').trim().startsWith('SHIFT_REQUEST:')
}

function formatShiftTimeRange(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = start?.trim()
  const e = end?.trim()
  if (!s && !e) return null
  if (s && e) return `${s} – ${e}`
  return s ?? e ?? null
}

function dayShortFromYmd(ymd: string): string {
  const d = ymdToUtcNoonDate(ymd)
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

function isoWeekdayFromYmd(ymd: string): number {
  const d = ymdToUtcNoonDate(ymd)
  const dow = d.getUTCDay()
  return dow === 0 ? 7 : dow
}

function isWeekendYmd(ymd: string): boolean {
  const dow = isoWeekdayFromYmd(ymd)
  return dow === 6 || dow === 7
}

function isLateCloseEnd(endTime: string | null | undefined): boolean {
  const e = endTime?.trim()
  if (!e) return false
  return e >= '20:00'
}

export function staffRosterStatusLabel(status: StaffRosterDayStatus): string {
  switch (status) {
    case 'working':
      return 'Working'
    case 'off':
      return 'Off'
    case 'unassigned':
      return 'Unassigned'
    case 'vacation':
      return 'Vacation'
    case 'sick':
      return 'Sick leave'
    case 'day_off':
      return 'Day off'
    case 'station_closed':
      return 'Station closed'
    default:
      return status
  }
}

function buildWeekSummaryLine(days: StaffRosterReportDay[]): string {
  const shifts = days.filter((d) => d.status === 'working').length
  const off = days.filter((d) => d.status === 'off').length
  const unassigned = days.filter((d) => d.status === 'unassigned').length
  const parts: string[] = []
  parts.push(`${shifts} shift${shifts === 1 ? '' : 's'}`)
  if (off > 0) parts.push(`${off} off`)
  if (unassigned > 0) parts.push(`${unassigned} unassigned`)
  for (const overlay of ['vacation', 'sick', 'day_off'] as const) {
    const labeled = days.filter((d) => d.status === overlay)
    if (labeled.length > 0) {
      const short =
        overlay === 'vacation' ? 'Vacation' : overlay === 'sick' ? 'Sick' : 'Day off'
      const daysList = labeled.map((d) => d.dayShort).join(', ')
      parts.push(`${short} ${daysList}`)
    }
  }
  return parts.join(' · ')
}

function buildPeriodSummaries(days: StaffRosterReportDay[]): {
  shiftSummaries: StaffRosterReportShiftSummary[]
  periodSummaryLine: string
  weekendShiftCount: number
  lateCloseCount: number
  scheduledShiftCount: number
} {
  const shiftCounts = new Map<string, StaffRosterReportShiftSummary>()
  let weekendShiftCount = 0
  let lateCloseCount = 0
  let scheduledShiftCount = 0
  let offCount = 0
  let unassignedCount = 0

  for (const d of days) {
    if (d.status === 'working') {
      scheduledShiftCount++
      const key = d.shiftName ?? 'shift'
      const existing = shiftCounts.get(key)
      if (existing) {
        existing.count++
      } else {
        shiftCounts.set(key, {
          key,
          label: d.shiftName ?? 'Shift',
          count: 1,
          color: d.shiftColor
        })
      }
      if (isWeekendYmd(d.dateYmd)) weekendShiftCount++
      if (isLateCloseEnd(d.shiftEnd)) lateCloseCount++
    } else if (d.status === 'off') {
      offCount++
    } else if (d.status === 'unassigned') {
      unassignedCount++
    }
  }

  const shiftSummaries = [...shiftCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  const parts: string[] = shiftSummaries.map((s) => `${s.label} × ${s.count}`)
  if (offCount > 0) parts.push(`Off × ${offCount}`)
  if (unassignedCount > 0) parts.push(`Unassigned × ${unassignedCount}`)

  const extras: string[] = []
  if (weekendShiftCount > 0) {
    extras.push(
      `${weekendShiftCount} weekend shift${weekendShiftCount === 1 ? '' : 's'}`
    )
  }
  if (lateCloseCount > 0) {
    extras.push(`${lateCloseCount} late close${lateCloseCount === 1 ? '' : 's'}`)
  }

  const periodSummaryLine =
    parts.length > 0
      ? extras.length > 0
        ? `${parts.join(' · ')} · ${extras.join(' · ')}`
        : parts.join(' · ')
      : extras.join(' · ')

  return {
    shiftSummaries,
    periodSummaryLine,
    weekendShiftCount,
    lateCloseCount,
    scheduledShiftCount
  }
}

export async function buildStaffRosterReport(params: {
  staffId: string
  startDate: string
  endDate: string
  timeZone?: string
  publishedOnly?: boolean
}): Promise<StaffRosterReport> {
  const { staffId, startDate, endDate } = params
  const publishedOnly = params.publishedOnly !== false

  if (!isYmd(startDate) || !isYmd(endDate)) {
    throw new Error('Invalid date format (use YYYY-MM-DD)')
  }
  if (startDate > endDate) {
    throw new Error('startDate must be on or before endDate')
  }

  const tz = params.timeZone ?? (await readStationTimeZone())
  const dates = enumerateYmdInclusive(startDate, endDate, tz)
  if (dates.length > STAFF_ROSTER_REPORT_MAX_DAYS) {
    throw new Error(`Date range too long (max ${STAFF_ROSTER_REPORT_MAX_DAYS} days)`)
  }

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      name: true,
      vacationStart: true,
      vacationEnd: true
    }
  })
  if (!staff) {
    throw new Error('Staff not found')
  }

  const firstMonday = mondayOfWeekYmd(startDate, tz)
  const lastMonday = mondayOfWeekYmd(endDate, tz)

  const [rosterWeeks, rosterEntries, sickLeaves, dayOffs, publicHolidays] = await Promise.all([
    prisma.rosterWeek.findMany({
      where: { weekStart: { gte: firstMonday, lte: lastMonday } },
      select: { weekStart: true, status: true }
    }),
    prisma.rosterEntry.findMany({
      where: { staffId, date: { gte: startDate, lte: endDate } },
      include: {
        shiftTemplate: {
          select: { name: true, startTime: true, endTime: true, color: true }
        }
      }
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
    prisma.publicHoliday.findMany({
      where: {
        countryCode: 'LC',
        date: { gte: startDate, lte: endDate }
      },
      select: { date: true, name: true, stationClosed: true }
    })
  ])

  const weekStatusByStart = new Map<string, RosterWeekPublication>()
  for (const w of rosterWeeks) {
    weekStatusByStart.set(w.weekStart, w.status === 'published' ? 'published' : 'draft')
  }

  const rosterByDate = new Map(
    rosterEntries.map((e) => [
      e.date,
      {
        shiftTemplateId: e.shiftTemplateId,
        shiftName: e.shiftTemplate?.name ?? null,
        shiftStart: e.shiftTemplate?.startTime ?? null,
        shiftEnd: e.shiftTemplate?.endTime ?? null,
        shiftColor: e.shiftTemplate?.color ?? null,
        position: e.position,
        notes: e.notes ?? ''
      }
    ])
  )

  const holidayByDate = new Map(
    publicHolidays.map((h) => [h.date, { name: h.name, stationClosed: h.stationClosed }])
  )

  const dayOffByDate = new Map(
    dayOffs
      .filter((d) => !isShiftRequestDayOff(d.reason))
      .map((d) => [d.date, d.reason?.trim() ?? ''])
  )

  function isOnSickLeave(ymd: string): boolean {
    return sickLeaves.some((sl) => sl.startDate <= ymd && sl.endDate >= ymd)
  }

  function weekPublicationFor(ymd: string): RosterWeekPublication {
    const weekStart = mondayOfWeekYmd(ymd, tz)
    return weekStatusByStart.get(weekStart) ?? 'missing'
  }

  function resolveRosterForDay(ymd: string): {
    isScheduled: boolean
    isRosterOff: boolean
    shiftName: string | null
    shiftStart: string | null
    shiftEnd: string | null
    shiftColor: string | null
    position: string | null
    rosterNotes: string
    weekStatus: RosterWeekPublication
  } {
    const weekStatus = weekPublicationFor(ymd)
    if (publishedOnly && weekStatus !== 'published') {
      return {
        isScheduled: false,
        isRosterOff: false,
        shiftName: null,
        shiftStart: null,
        shiftEnd: null,
        shiftColor: null,
        position: null,
        rosterNotes: '',
        weekStatus
      }
    }

    const entry = rosterByDate.get(ymd)
    if (!entry) {
      return {
        isScheduled: false,
        isRosterOff: false,
        shiftName: null,
        shiftStart: null,
        shiftEnd: null,
        shiftColor: null,
        position: null,
        rosterNotes: '',
        weekStatus
      }
    }

    return {
      isScheduled: entry.shiftTemplateId != null,
      isRosterOff: entry.shiftTemplateId == null,
      shiftName: entry.shiftName,
      shiftStart: entry.shiftStart,
      shiftEnd: entry.shiftEnd,
      shiftColor: entry.shiftColor,
      position: entry.position,
      rosterNotes: entry.notes,
      weekStatus
    }
  }

  const days: StaffRosterReportDay[] = []

  for (const dateYmd of dates) {
    const weekStart = mondayOfWeekYmd(dateYmd, tz)
    const holiday = holidayByDate.get(dateYmd)
    const roster = resolveRosterForDay(dateYmd)
    const rosterShiftName =
      roster.isScheduled && roster.shiftName ? roster.shiftName : null

    let status: StaffRosterDayStatus
    let statusNote = ''
    let shiftName = roster.shiftName
    let shiftStart = roster.shiftStart
    let shiftEnd = roster.shiftEnd
    let shiftColor = roster.shiftColor
    let overlayRosterShift: string | null = null

    if (holiday?.stationClosed) {
      status = 'station_closed'
      statusNote = holiday.name
      shiftName = null
      shiftStart = null
      shiftEnd = null
      shiftColor = null
    } else if (isDateInVacation(dateYmd, staff.vacationStart, staff.vacationEnd)) {
      status = 'vacation'
      statusNote = rosterShiftName ? `Roster: ${rosterShiftName}` : ''
      overlayRosterShift = rosterShiftName
      shiftName = null
      shiftStart = null
      shiftEnd = null
      shiftColor = null
    } else if (isOnSickLeave(dateYmd)) {
      status = 'sick'
      statusNote = rosterShiftName ? `Roster: ${rosterShiftName}` : ''
      overlayRosterShift = rosterShiftName
      shiftName = null
      shiftStart = null
      shiftEnd = null
      shiftColor = null
    } else if (dayOffByDate.has(dateYmd)) {
      status = 'day_off'
      const reason = dayOffByDate.get(dateYmd)!
      statusNote = reason
        ? rosterShiftName
          ? `${reason} · Roster: ${rosterShiftName}`
          : reason
        : rosterShiftName
          ? `Roster: ${rosterShiftName}`
          : ''
      overlayRosterShift = rosterShiftName
      shiftName = null
      shiftStart = null
      shiftEnd = null
      shiftColor = null
    } else if (publishedOnly && roster.weekStatus === 'draft') {
      status = 'unassigned'
      statusNote = 'Draft roster (not published)'
      shiftName = null
      shiftStart = null
      shiftEnd = null
      shiftColor = null
    } else if (publishedOnly && roster.weekStatus === 'missing') {
      status = 'unassigned'
      statusNote = 'No published roster for this week'
      shiftName = null
      shiftStart = null
      shiftEnd = null
      shiftColor = null
    } else if (roster.isScheduled) {
      status = 'working'
    } else if (roster.isRosterOff) {
      status = 'off'
      shiftName = null
      shiftStart = null
      shiftEnd = null
      shiftColor = null
    } else {
      status = 'unassigned'
      if (holiday) statusNote = holiday.name
    }

    if (holiday && status === 'working') {
      statusNote = statusNote ? `${statusNote} · ${holiday.name}` : holiday.name
    }

    days.push({
      dateYmd,
      dateLabel: formatDateOnlyForDisplay(dateYmd),
      dayShort: dayShortFromYmd(dateYmd),
      dayNum: dateYmd.slice(8, 10),
      status,
      statusLabel: staffRosterStatusLabel(status),
      statusNote,
      shiftName,
      shiftStart,
      shiftEnd,
      shiftColor,
      position: roster.position,
      rosterNotes: roster.rosterNotes,
      holidayName: holiday?.name ?? null,
      rosterShiftName: overlayRosterShift,
      weekStart
    })
  }

  const weeks: StaffRosterReportWeek[] = []
  let cursor = firstMonday
  while (cursor <= lastMonday) {
    const weekDays = days.filter((d) => d.weekStart === cursor)
    if (weekDays.length > 0) {
      const rosterStatus = weekStatusByStart.get(cursor) ?? 'missing'
      const weekEnd = addDays(cursor, 6)
      weeks.push({
        weekStart: cursor,
        weekEnd,
        weekLabel: `Week of ${formatDateOnlyForDisplay(cursor)}`,
        rosterStatus,
        days: weekDays,
        summaryLine: buildWeekSummaryLine(weekDays)
      })
    }
    cursor = addCalendarDaysYmd(cursor, 7, tz)
  }

  const {
    shiftSummaries,
    periodSummaryLine,
    weekendShiftCount,
    lateCloseCount,
    scheduledShiftCount
  } = buildPeriodSummaries(days)

  const periodLabel = startDate === endDate ? startDate : `${startDate} → ${endDate}`

  return {
    staffId,
    staffName: staff.name.trim(),
    startDate,
    endDate,
    periodLabel,
    timeZone: tz,
    publishedOnly,
    scheduledShiftCount,
    days,
    weeks,
    shiftSummaries,
    periodSummaryLine,
    weekendShiftCount,
    lateCloseCount
  }
}

/** Column headers (Mon–Sun) for a week block that may be a partial range. */
export function weekColumnHeaders(weekStart: string, startDate: string, endDate: string): string[] {
  const headers: string[] = []
  for (let i = 0; i < 7; i++) {
    const ymd = addDays(weekStart, i)
    if (ymd >= startDate && ymd <= endDate) {
      headers.push(`${ROSTER_DAY_LABELS[i]} ${ymd.slice(8)}`)
    }
  }
  return headers
}

export function formatShiftTimesDisplay(day: StaffRosterReportDay): string | null {
  return formatShiftTimeRange(day.shiftStart, day.shiftEnd)
}
