import { deviceUserIdsMatch } from '@/lib/device-user-id'
import { prisma } from '@/lib/prisma'
import {
  inactiveStaffIdsWithVacationOverlap,
  mergePayPeriodStaffLists,
  payPeriodStaffSelect,
  staffIdsFromAttendanceLogs
} from '@/lib/pay-period-staff-union'

/** YYYY-MM-DD for an instant in the given IANA timezone (en-CA for ISO-like order). */
export function ymdInZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

/** First instant (UTC) where the calendar date in `timeZone` equals `ymd`. */
export function startOfZonedDayUtc(ymd: string, timeZone: string): Date {
  const [y, mo, da] = ymd.split('-').map(Number)
  let lo = Date.UTC(y, mo - 1, da - 2, 0, 0, 0)
  let hi = Date.UTC(y, mo - 1, da + 2, 0, 0, 0)
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2)
    const z = ymdInZone(new Date(mid), timeZone)
    if (z < ymd) lo = mid
    else hi = mid
  }
  return new Date(hi)
}

export function addOneCalendarDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function endOfZonedDayUtc(ymd: string, timeZone: string): Date {
  const next = addOneCalendarDayYmd(ymd)
  const nextStart = startOfZonedDayUtc(next, timeZone)
  return new Date(nextStart.getTime() - 1)
}

/** Same rule as pay-period generate: consecutive in→out pairs in sorted order. */
export function hoursFromPunchSequence(
  arr: Array<{ punchTime: Date; punchType: string }>
): number {
  const sorted = [...arr].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
  let totalHours = 0
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].punchType === 'in' && sorted[i + 1].punchType === 'out') {
      const hrs =
        (sorted[i + 1].punchTime.getTime() - sorted[i].punchTime.getTime()) / (1000 * 60 * 60)
      totalHours += hrs
    }
  }
  return Math.round(totalHours * 100) / 100
}

function buildHoursByStaffKey(
  logs: Array<{ staffId: string | null; deviceUserId: string; punchTime: Date; punchType: string }>
): Map<string, number> {
  const byStaff = new Map<string, Array<{ punchTime: Date; punchType: string }>>()
  for (const log of logs) {
    const key = log.staffId || log.deviceUserId
    if (!key) continue
    if (!byStaff.has(key)) byStaff.set(key, [])
    byStaff.get(key)!.push({ punchTime: log.punchTime, punchType: log.punchType })
  }
  const m = new Map<string, number>()
  for (const [key, arr] of byStaff) {
    m.set(key, hoursFromPunchSequence(arr))
  }
  return m
}

function staffHoursFromMap(
  staffId: string,
  deviceUserId: string | null,
  map: Map<string, number>
): number {
  return map.get(staffId) ?? (deviceUserId ? map.get(deviceUserId) ?? 0 : 0)
}

export async function getPayPeriodCutoffStartYmd(): Promise<string | null> {
  const last = await prisma.payPeriod.findFirst({
    where: { emailSentAt: { not: null } },
    orderBy: { emailSentAt: 'desc' }
  })
  if (!last) return null
  return addOneCalendarDayYmd(last.endDate)
}

/**
 * Inclusive start of the “current” pay period for running totals: day after last emailed pay period’s end,
 * or the 1st of the report month if none.
 */
export function resolvePayPeriodStartYmd(
  reportDateYmd: string,
  cutoffAfterLastPayPeriod: string | null
): string {
  if (cutoffAfterLastPayPeriod) return cutoffAfterLastPayPeriod
  return `${reportDateYmd.slice(0, 7)}-01`
}

export type AttendanceSummaryRow = {
  staffId: string
  staffName: string
  hoursToday: number
  hoursPeriodToDate: number
  punchesToday: Array<{ punchTimeIso: string; punchType: string; label: string }>
}

/** Period bounds match `/api/attendance/pay-period/generate` (local `T00:00` / `T23:59:59.999` on the date strings). */
function periodBounds(periodStartYmd: string, reportDateYmd: string): { start: Date; end: Date } {
  return {
    start: new Date(periodStartYmd + 'T00:00:00'),
    end: new Date(reportDateYmd + 'T23:59:59.999')
  }
}

function logBelongsToStaff(
  log: { staffId: string | null; deviceUserId: string },
  s: { id: string; deviceUserId: string | null }
): boolean {
  if (log.staffId && log.staffId === s.id) return true
  const dev = s.deviceUserId?.trim()
  return Boolean(dev && deviceUserIdsMatch(log.deviceUserId, dev))
}

export async function buildAttendanceSummaryData(
  reportDateYmd: string,
  timeZone: string
): Promise<{
  reportDateYmd: string
  periodStartYmd: string
  periodLabel: string
  rows: AttendanceSummaryRow[]
}> {
  const activeBaseline = await prisma.staff.findMany({
    where: { status: 'active', role: { not: 'manager' } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: payPeriodStaffSelect
  })

  const cutoff = await getPayPeriodCutoffStartYmd()
  const periodStartYmd = resolvePayPeriodStartYmd(reportDateYmd, cutoff)
  const { start: periodStart, end: periodEnd } = periodBounds(periodStartYmd, reportDateYmd)

  const dayStart = startOfZonedDayUtc(reportDateYmd, timeZone)
  const dayEnd = endOfZonedDayUtc(reportDateYmd, timeZone)

  const periodLogs = await prisma.attendanceLog.findMany({
    where: {
      punchTime: { gte: periodStart, lte: periodEnd },
      extractedAt: null
    },
    orderBy: { punchTime: 'asc' }
  })

  const sickLeavesOverlap = await prisma.staffSickLeave.findMany({
    where: {
      status: 'approved',
      startDate: { lte: reportDateYmd },
      endDate: { gte: periodStartYmd }
    },
    select: { staffId: true }
  })

  const signalStaffIds = await staffIdsFromAttendanceLogs(periodLogs)
  for (const sl of sickLeavesOverlap) signalStaffIds.add(sl.staffId)
  for (const id of await inactiveStaffIdsWithVacationOverlap(periodStartYmd, reportDateYmd)) {
    signalStaffIds.add(id)
  }

  const activeIds = new Set(activeBaseline.map((s) => s.id))
  const supplementalIds = [...signalStaffIds].filter((id) => !activeIds.has(id))

  const inactiveSupplemental =
    supplementalIds.length === 0
      ? []
      : await prisma.staff.findMany({
          where: {
            id: { in: supplementalIds },
            status: 'inactive',
            role: { not: 'manager' }
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: payPeriodStaffSelect
        })

  const staff = mergePayPeriodStaffLists(activeBaseline, inactiveSupplemental)

  const dailyLogs = periodLogs.filter((l) => l.punchTime >= dayStart && l.punchTime <= dayEnd)

  const periodHours = buildHoursByStaffKey(periodLogs)
  const dayHours = buildHoursByStaffKey(dailyLogs)

  const fmtTime = (d: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d)

  const rows: AttendanceSummaryRow[] = []
  for (const s of staff) {
    const punchesToday = dailyLogs
      .filter((l) => logBelongsToStaff(l, s))
      .map((l) => ({
        punchTimeIso: l.punchTime.toISOString(),
        punchType: l.punchType,
        label: fmtTime(l.punchTime)
      }))

    rows.push({
      staffId: s.id,
      staffName: s.firstName?.trim() || s.name,
      hoursToday: staffHoursFromMap(s.id, s.deviceUserId, dayHours),
      hoursPeriodToDate: staffHoursFromMap(s.id, s.deviceUserId, periodHours),
      punchesToday
    })
  }

  const periodLabel =
    periodStartYmd === reportDateYmd
      ? periodStartYmd
      : `${periodStartYmd} → ${reportDateYmd}`

  return {
    reportDateYmd,
    periodStartYmd,
    periodLabel,
    rows
  }
}
