import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { deviceUserIdLookupKeys, expandDeviceUserIdsForDbMatch } from '@/lib/device-user-id'
import { prisma } from '@/lib/prisma'
import {
  addCalendarYmd,
  buildPresenceForDate,
  calendarYmdInTz,
  getPresentAbsenceSettings,
  mondayOfWeekYmd,
  readStationTimeZone,
  type PresenceStatus
} from '@/lib/present-absence'
import { isFullAccessRole, isOperationsManagerRole } from '@/lib/roles'

/** Canonical route for the read-only mobile attendance dashboard. */
export const ATTENDANCE_VIEWER_PATH = '/attendance/viewer'

export function canAccessAttendanceViewer(role: string): boolean {
  return isFullAccessRole(role) || isOperationsManagerRole(role)
}

export function isAttendanceViewerPath(pathname: string): boolean {
  return (
    pathname === ATTENDANCE_VIEWER_PATH ||
    pathname.startsWith('/api/attendance/viewer-summary')
  )
}

/** Safe internal redirect target; rejects external/open redirects. */
export function sanitizeHomePath(path: string | null | undefined): string | null {
  if (path == null) return null
  const p = String(path).trim()
  if (!p || !p.startsWith('/') || p.startsWith('//') || p.includes('..')) return null
  if (p.startsWith('/api') || p === '/login') return null
  return p
}

export function resolvePostLoginPath(
  user: { homePath?: string | null; role: string },
  nextParam?: string | null
): string {
  const next = nextParam?.trim()
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('..')) {
    return next
  }
  const home = sanitizeHomePath(user.homePath ?? null)
  if (home) return home
  return '/dashboard'
}

export interface AttendanceSummaryCounts {
  present: number
  late: number
  absent: number
  pending: number
  off: number
  scheduled: number
}

export interface ViewerPunchRow {
  id: string
  punchTime: string
  punchType: 'in' | 'out'
  staffId: string | null
  staffName: string
  source: string
}

export interface ViewerStaffRow {
  staffId: string
  staffName: string
  staffFirstName: string
  shiftName: string
  shiftColor: string | null
  shiftStartTime: string
  status: PresenceStatus | string
  lateReason: string
  manualPresent: boolean
  manualAbsent: boolean
  punchExempt: boolean
  lastIn: string | null
  lastOut: string | null
}

export interface ViewerWeekDay {
  date: string
  scheduledCount: number
  summary: AttendanceSummaryCounts
  isToday: boolean
}

function emptySummary(): AttendanceSummaryCounts {
  return { present: 0, late: 0, absent: 0, pending: 0, off: 0, scheduled: 0 }
}

function tallyStatus(summary: AttendanceSummaryCounts, status: string) {
  summary.scheduled += 1
  switch (status) {
    case 'present':
      summary.present += 1
      break
    case 'late':
      summary.late += 1
      break
    case 'absent':
      summary.absent += 1
      break
    case 'pending':
      summary.pending += 1
      break
    case 'off':
      summary.off += 1
      break
    default:
      break
  }
}

async function loadPunchesForDay(
  dateYmd: string,
  tz: string,
  staffIds: string[]
): Promise<{
  recentPunches: ViewerPunchRow[]
  lastByStaffId: Map<string, { lastIn: Date | null; lastOut: Date | null }>
}> {
  const windowStart = fromZonedTime(`${dateYmd}T00:00:00`, tz)
  const nextYmd = addCalendarYmd(dateYmd, 1, tz)
  const windowEndExclusive = fromZonedTime(`${nextYmd}T00:00:00`, tz)

  const staffRows =
    staffIds.length > 0
      ? await prisma.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, name: true, deviceUserId: true }
        })
      : []

  const deviceIdsRaw = staffRows
    .map((s) => s.deviceUserId)
    .filter((d): d is string => Boolean(d && d.trim()))
  const deviceIds = expandDeviceUserIdsForDbMatch(deviceIdsRaw)

  const orClause: Array<{ staffId?: { in: string[] }; deviceUserId?: { in: string[] } }> = []
  if (staffIds.length) orClause.push({ staffId: { in: staffIds } })
  if (deviceIds.length) orClause.push({ deviceUserId: { in: deviceIds } })

  if (orClause.length === 0) {
    return { recentPunches: [], lastByStaffId: new Map() }
  }

  const logs = await prisma.attendanceLog.findMany({
    where: {
      punchTime: { gte: windowStart, lt: windowEndExclusive },
      OR: orClause
    },
    include: { staff: { select: { id: true, name: true } } },
    orderBy: { punchTime: 'desc' }
  })

  const deviceToStaff = new Map<string, string>()
  const nameByStaffId = new Map(staffRows.map((s) => [s.id, s.name]))
  for (const s of staffRows) {
    if (!s.deviceUserId?.trim()) continue
    for (const k of deviceUserIdLookupKeys(s.deviceUserId.trim())) {
      deviceToStaff.set(k, s.id)
    }
  }

  const lastByStaffId = new Map<string, { lastIn: Date | null; lastOut: Date | null }>()
  staffIds.forEach((id) => lastByStaffId.set(id, { lastIn: null, lastOut: null }))

  const recentPunches: ViewerPunchRow[] = []

  for (const log of logs) {
    const day = calendarYmdInTz(log.punchTime, tz)
    if (day !== dateYmd) continue

    let sid = log.staffId
    if (!sid) {
      for (const k of deviceUserIdLookupKeys(log.deviceUserId)) {
        sid = deviceToStaff.get(k) ?? null
        if (sid) break
      }
    }

    const staffName =
      log.staff?.name ??
      (sid ? nameByStaffId.get(sid) : null) ??
      log.deviceUserName?.trim() ??
      'Unknown'

    const punchType = log.punchType === 'out' ? 'out' : 'in'

    if (sid && staffIds.includes(sid)) {
      const slot = lastByStaffId.get(sid)!
      if (punchType === 'in') {
        if (!slot.lastIn || log.punchTime > slot.lastIn) slot.lastIn = log.punchTime
      } else if (!slot.lastOut || log.punchTime > slot.lastOut) {
        slot.lastOut = log.punchTime
      }
    }

    recentPunches.push({
      id: log.id,
      punchTime: log.punchTime.toISOString(),
      punchType,
      staffId: sid,
      staffName,
      source: log.source
    })
  }

  return { recentPunches: recentPunches.slice(0, 30), lastByStaffId }
}

async function summaryForDate(
  dateYmd: string,
  tz: string,
  graceMinutes: number,
  options: { includePunches: boolean }
) {
  const built = await buildPresenceForDate({ dateYmd, tz, graceMinutes })
  const byStaff = new Map<string, (typeof built.scheduled)[0]>()
  for (const s of built.scheduled) {
    if (!byStaff.has(s.staffId)) byStaff.set(s.staffId, s)
  }

  const summary = emptySummary()
  const rows: Array<{
    staffId: string
    staffName: string
    staffFirstName: string
    shiftName: string
    shiftColor: string | null
    shiftStartTime: string
    status: string
    lateReason: string
    manualPresent: boolean
    manualAbsent: boolean
    punchExempt: boolean
  }> = []

  for (const [staffId, s] of byStaff.entries()) {
    const p = built.presenceByStaffId[staffId]
    const status = p?.status ?? 'pending'
    tallyStatus(summary, status)
    rows.push({
      staffId,
      staffName: s.staffName,
      staffFirstName: s.staffFirstName,
      shiftName: s.shiftName,
      shiftColor: s.shiftColor,
      shiftStartTime: s.shiftStartTime,
      status,
      lateReason: p?.lateReason ?? '',
      manualPresent: p?.manualPresent ?? false,
      manualAbsent: p?.manualAbsent ?? false,
      punchExempt: p?.punchExempt ?? false
    })
  }

  const statusOrder: Record<string, number> = {
    absent: 0,
    late: 1,
    pending: 2,
    present: 3,
    off: 4
  }
  rows.sort((a, b) => {
    const oa = statusOrder[a.status] ?? 5
    const ob = statusOrder[b.status] ?? 5
    if (oa !== ob) return oa - ob
    return a.shiftStartTime.localeCompare(b.shiftStartTime)
  })

  const staffIds = rows.map((r) => r.staffId)
  if (!options.includePunches) {
    return {
      summary,
      rows: [] as ViewerStaffRow[],
      recentPunches: [] as ViewerPunchRow[],
      weekStart: built.weekStart
    }
  }

  const { recentPunches, lastByStaffId } = await loadPunchesForDay(dateYmd, tz, staffIds)

  const viewerRows: ViewerStaffRow[] = rows.map((r) => {
    const last = lastByStaffId.get(r.staffId)
    return {
      ...r,
      lastIn: last?.lastIn?.toISOString() ?? null,
      lastOut: last?.lastOut?.toISOString() ?? null
    }
  })

  return { summary, rows: viewerRows, recentPunches, weekStart: built.weekStart }
}

export async function buildAttendanceViewerSummary(dateYmd: string) {
  const tz = await readStationTimeZone()
  const settings = await getPresentAbsenceSettings()
  const todayYmd = calendarYmdInTz(new Date(), tz)

  if (!settings.enabled) {
    const weekStart = mondayOfWeekYmd(dateYmd, tz)
    const weekDays: ViewerWeekDay[] = []
    for (let i = 0; i < 7; i++) {
      const d = addCalendarYmd(weekStart, i, tz)
      weekDays.push({
        date: d,
        scheduledCount: 0,
        summary: emptySummary(),
        isToday: d === todayYmd
      })
    }
    return {
      enabled: false,
      date: dateYmd,
      todayYmd,
      stationTimeZone: tz,
      weekStart,
      weekDays,
      summary: emptySummary(),
      rows: [] as ViewerStaffRow[],
      recentPunches: [] as ViewerPunchRow[]
    }
  }

  const weekStart = mondayOfWeekYmd(dateYmd, tz)
  const weekDayDates = Array.from({ length: 7 }, (_, i) => addCalendarYmd(weekStart, i, tz))

  const [dayData, ...weekSummaries] = await Promise.all([
    summaryForDate(dateYmd, tz, settings.graceMinutes, { includePunches: true }),
    ...weekDayDates
      .filter((d) => d !== dateYmd)
      .map((d) => summaryForDate(d, tz, settings.graceMinutes, { includePunches: false }))
  ])

  const weekSummaryByDate = new Map<string, (typeof weekSummaries)[0]>()
  weekDayDates
    .filter((d) => d !== dateYmd)
    .forEach((d, i) => weekSummaryByDate.set(d, weekSummaries[i]))
  weekSummaryByDate.set(dateYmd, dayData)

  const weekDays: ViewerWeekDay[] = weekDayDates.map((d) => {
    const s = weekSummaryByDate.get(d)!
    return {
      date: d,
      scheduledCount: s.summary.scheduled,
      summary: s.summary,
      isToday: d === todayYmd
    }
  })

  return {
    enabled: true,
    date: dateYmd,
    todayYmd,
    stationTimeZone: tz,
    graceMinutes: settings.graceMinutes,
    weekStart,
    weekDays,
    summary: dayData.summary,
    rows: dayData.rows,
    recentPunches: dayData.recentPunches
  }
}

export function formatPunchTimeLocal(iso: string, tz: string): string {
  return formatInTimeZone(new Date(iso), tz, 'HH:mm')
}

export function formatViewerDateLabel(ymd: string, tz: string): string {
  const noon = fromZonedTime(`${ymd}T12:00:00`, tz)
  return formatInTimeZone(noon, tz, 'EEE d MMM')
}
