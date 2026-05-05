import { addMinutes } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { addCalendarDaysYmd, BUSINESS_TIME_ZONE, toYmdInBusinessTz } from '@/lib/datetime-policy'
import { deviceUserIdLookupKeys, expandDeviceUserIdsForDbMatch } from '@/lib/device-user-id'
import { prisma } from '@/lib/prisma'

export const PRESENT_ABSENCE_ENABLED_KEY = 'attendance_present_absence_enabled'
export const PRESENT_ABSENCE_GRACE_MINUTES_KEY = 'attendance_grace_minutes'
export const PRESENT_ABSENCE_NOTIFY_EMAIL_KEY = 'attendance_absence_notify_email'
export const PRESENT_ABSENCE_NOTIFY_WHATSAPP_KEY = 'attendance_absence_notify_whatsapp'
export const PRESENT_ABSENCE_NOTIFY_EMAIL_RECIPIENTS_KEY = 'attendance_absence_notify_email_recipients'
export const PRESENT_ABSENCE_NOTIFY_WHATSAPP_NUMBERS_KEY = 'attendance_absence_notify_whatsapp_numbers'
export const PRESENT_ABSENCE_NOTIFY_LOG_KEY = 'attendance_absence_notify_log'

export type PresenceStatus = 'pending' | 'present' | 'late' | 'absent' | 'off'

export interface PresentAbsenceSettings {
  enabled: boolean
  graceMinutes: number
  notifyEmail: boolean
  notifyWhatsApp: boolean
  notifyEmailRecipients: string
  notifyWhatsAppNumbers: string
}

function parseBool(v: string | undefined, defaultVal = false): boolean {
  if (v === undefined || v === '') return defaultVal
  return v === 'true' || v === '1'
}

function parseGraceMinutes(v: string | undefined): number {
  const n = parseInt(String(v ?? '60'), 10)
  if (!Number.isFinite(n)) return 60
  return Math.min(24 * 60, Math.max(1, n))
}

export async function readStationTimeZone(): Promise<string> {
  return BUSINESS_TIME_ZONE
}

export async function getPresentAbsenceSettings(): Promise<PresentAbsenceSettings> {
  const keys = [
    PRESENT_ABSENCE_ENABLED_KEY,
    PRESENT_ABSENCE_GRACE_MINUTES_KEY,
    PRESENT_ABSENCE_NOTIFY_EMAIL_KEY,
    PRESENT_ABSENCE_NOTIFY_WHATSAPP_KEY,
    PRESENT_ABSENCE_NOTIFY_EMAIL_RECIPIENTS_KEY,
    PRESENT_ABSENCE_NOTIFY_WHATSAPP_NUMBERS_KEY
  ]
  const rows = await prisma.appSettings.findMany({ where: { key: { in: keys } } })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    enabled: parseBool(map.get(PRESENT_ABSENCE_ENABLED_KEY)),
    graceMinutes: parseGraceMinutes(map.get(PRESENT_ABSENCE_GRACE_MINUTES_KEY)),
    notifyEmail: parseBool(map.get(PRESENT_ABSENCE_NOTIFY_EMAIL_KEY)),
    notifyWhatsApp: parseBool(map.get(PRESENT_ABSENCE_NOTIFY_WHATSAPP_KEY)),
    notifyEmailRecipients: map.get(PRESENT_ABSENCE_NOTIFY_EMAIL_RECIPIENTS_KEY) ?? '',
    notifyWhatsAppNumbers: map.get(PRESENT_ABSENCE_NOTIFY_WHATSAPP_NUMBERS_KEY) ?? ''
  }
}

/** Calendar YYYY-MM-DD for `instant` in IANA `tz`. */
export function calendarYmdInTz(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, 'yyyy-MM-dd')
}

export function addCalendarYmd(ymd: string, delta: number, tz: string): string {
  return addCalendarDaysYmd(ymd, delta, tz)
}

/** Monday YYYY-MM-DD (week starts Monday) for the week containing `ymd` in `tz`. */
export function mondayOfWeekYmd(ymd: string, tz: string): string {
  const noon = fromZonedTime(`${ymd}T12:00:00`, tz)
  const isoDow = parseInt(formatInTimeZone(noon, tz, 'i'), 10)
  const daysBack = isoDow - 1
  const mondayMs = noon.getTime() - daysBack * 24 * 60 * 60 * 1000
  return formatInTimeZone(new Date(mondayMs), tz, 'yyyy-MM-dd')
}

function defaultShiftStart(shiftStartHHmm: string | null | undefined): string {
  const s = (shiftStartHHmm ?? '06:00').trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return '06:00'
  const h = m[1].padStart(2, '0')
  const min = m[2].padStart(2, '0')
  return `${h}:${min}`
}

export function shiftStartInstantOnDate(ymd: string, shiftStartHHmm: string, tz: string): Date {
  const hhmm = defaultShiftStart(shiftStartHHmm)
  return fromZonedTime(`${ymd}T${hhmm}:00`, tz)
}

export function computePresenceStatus(params: {
  dateYmd: string
  todayYmd: string
  now: Date
  graceMinutes: number
  shiftStartHHmm: string
  tz: string
  hasPunch: boolean
  manualPresent: boolean
  isExpected: boolean
  /** No punch clock: auto-present when expected unless manualAbsent */
  punchExempt?: boolean
  manualAbsent?: boolean
}): PresenceStatus {
  const {
    dateYmd,
    todayYmd,
    now,
    graceMinutes,
    shiftStartHHmm,
    tz,
    hasPunch,
    manualPresent,
    isExpected,
    punchExempt = false,
    manualAbsent = false
  } = params

  if (!isExpected) return 'off'
  if (punchExempt && manualAbsent) return 'absent'
  if (manualPresent) return 'present'
  if (punchExempt && !manualAbsent) return 'present'
  if (hasPunch) return 'present'

  const shiftStart = shiftStartInstantOnDate(dateYmd, shiftStartHHmm, tz)
  const graceEnd = addMinutes(shiftStart, graceMinutes)

  if (dateYmd > todayYmd) return 'pending'
  if (dateYmd < todayYmd) return 'absent'

  if (now < graceEnd) return 'pending'
  return 'late'
}

export interface ScheduledRow {
  staffId: string
  staffName: string
  staffFirstName: string
  shiftName: string
  shiftColor: string | null
  shiftStartTime: string
}

function isShiftRequestDayOff(reason: string | null | undefined): boolean {
  const raw = (reason ?? '').trim()
  return raw.startsWith('SHIFT_REQUEST:')
}

export async function loadRosterForCalendarYmd(
  ymd: string,
  tz: string
): Promise<{
  weekStart: string
  scheduled: ScheduledRow[]
  off: { staffId: string; staffName: string; staffFirstName: string }[]
  onVacation: { staffId: string; staffName: string; staffFirstName: string }[]
}> {
  const weekStart = mondayOfWeekYmd(ymd, tz)

  const firstName = (s: { name: string; firstName: string | null }) =>
    (s.firstName && s.firstName.trim()) || s.name.split(' ')[0] || s.name

  const [week, vacationStaff, sickLeaveStaff, dayOffs] = await Promise.all([
    prisma.rosterWeek.findFirst({
      where: { weekStart },
      include: {
        entries: {
          where: { date: ymd, staff: { status: 'active' } },
          include: {
            staff: { select: { id: true, name: true, firstName: true } },
            shiftTemplate: { select: { id: true, name: true, color: true, startTime: true } }
          }
        }
      }
    }),
    prisma.staff.findMany({
      where: {
        status: 'active',
        vacationStart: { not: null },
        vacationEnd: { not: null },
        AND: [{ vacationStart: { lte: ymd } }, { vacationEnd: { gte: ymd } }]
      },
      select: { id: true, name: true, firstName: true }
    }),
    prisma.staffSickLeave.findMany({
      where: {
        status: { not: 'denied' },
        startDate: { lte: ymd },
        endDate: { gte: ymd },
        staff: { status: 'active' }
      },
      select: {
        staff: { select: { id: true, name: true, firstName: true } }
      }
    }),
    prisma.staffDayOff.findMany({
      where: { date: ymd, status: 'approved' },
      select: {
        staffId: true,
        reason: true,
        staff: { select: { id: true, name: true, firstName: true } }
      }
    })
  ])

  const offDayRequests = dayOffs.filter((d) => !isShiftRequestDayOff(d.reason))
  const blockedStaffIds = new Set<string>()
  vacationStaff.forEach((s) => blockedStaffIds.add(s.id))
  sickLeaveStaff.forEach((s) => blockedStaffIds.add(s.staff.id))
  offDayRequests.forEach((d) => blockedStaffIds.add(d.staffId))

  const entries = week?.entries ?? []
  const scheduled = entries
    .filter((e) => e.shiftTemplateId != null && !blockedStaffIds.has(e.staff.id))
    .map((e) => ({
      staffId: e.staff.id,
      staffName: e.staff.name,
      staffFirstName: firstName(e.staff),
      shiftName: e.shiftTemplate?.name ?? 'Shift',
      shiftColor: e.shiftTemplate?.color ?? null,
      shiftStartTime: e.shiftTemplate?.startTime ?? '06:00'
    }))

  const rosterOffToday = entries
    .filter((e) => e.shiftTemplateId == null)
    .map((e) => ({ staffId: e.staff.id, staffName: e.staff.name, staffFirstName: firstName(e.staff) }))

  const offMap = new Map<string, { staffName: string; staffFirstName: string }>()
  rosterOffToday.forEach((s) => offMap.set(s.staffId, { staffName: s.staffName, staffFirstName: s.staffFirstName }))
  vacationStaff.forEach((s) => offMap.set(s.id, { staffName: s.name, staffFirstName: firstName(s) }))
  sickLeaveStaff.forEach((s) =>
    offMap.set(s.staff.id, {
      staffName: s.staff.name,
      staffFirstName: firstName(s.staff)
    })
  )
  for (const d of offDayRequests) {
    offMap.set(d.staffId, {
      staffName: d.staff.name,
      staffFirstName: firstName(d.staff)
    })
  }

  const off = Array.from(offMap.entries()).map(([staffId, v]) => ({
    staffId,
    staffName: v.staffName,
    staffFirstName: v.staffFirstName
  }))

  const onVacation = vacationStaff.map((s) => ({
    staffId: s.id,
    staffName: s.name,
    staffFirstName: firstName(s)
  }))

  return { weekStart, scheduled, off, onVacation }
}

/** Staff IDs not expected to work (roster off, vacation, or one-off day off). */
export function buildExcludedStaffIds(
  off: { staffId: string }[],
  onVacation: { staffId: string }[]
): Set<string> {
  const s = new Set<string>()
  off.forEach((o) => s.add(o.staffId))
  onVacation.forEach((v) => s.add(v.staffId))
  return s
}

/** Earliest shift start when the same staff has multiple roster rows (rare). */
export function earliestShiftStartForStaff(scheduled: ScheduledRow[], staffId: string): string {
  const rows = scheduled.filter((r) => r.staffId === staffId)
  if (rows.length === 0) return '06:00'
  let best = defaultShiftStart(rows[0].shiftStartTime)
  for (let i = 1; i < rows.length; i++) {
    const t = defaultShiftStart(rows[i].shiftStartTime)
    if (t < best) best = t
  }
  return best
}

export async function loadPunchFlagsForStaffOnDate(
  staffIds: string[],
  ymd: string,
  tz: string
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>()
  staffIds.forEach((id) => result.set(id, false))
  if (staffIds.length === 0) return result

  const staffRows = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, deviceUserId: true }
  })
  const deviceIdsRaw = staffRows.map((s) => s.deviceUserId).filter((d): d is string => Boolean(d && d.trim()))
  const deviceIds = expandDeviceUserIdsForDbMatch(deviceIdsRaw)

  const windowStart = fromZonedTime(`${ymd}T00:00:00`, tz)
  const nextYmd = addCalendarYmd(ymd, 1, tz)
  const windowEndExclusive = fromZonedTime(`${nextYmd}T00:00:00`, tz)

  const orClause: Array<{ staffId?: { in: string[] }; deviceUserId?: { in: string[] } }> = []
  if (staffIds.length) orClause.push({ staffId: { in: staffIds } })
  if (deviceIds.length) orClause.push({ deviceUserId: { in: deviceIds } })
  if (orClause.length === 0) return result

  const logs = await prisma.attendanceLog.findMany({
    where: {
      punchTime: { gte: windowStart, lt: windowEndExclusive },
      OR: orClause
    },
    select: { staffId: true, deviceUserId: true, punchTime: true }
  })

  const deviceToStaff = new Map<string, string>()
  for (const s of staffRows) {
    if (!s.deviceUserId?.trim()) continue
    const canon = s.deviceUserId.trim()
    for (const k of deviceUserIdLookupKeys(canon)) {
      deviceToStaff.set(k, s.id)
    }
  }

  for (const log of logs) {
    const day = calendarYmdInTz(log.punchTime, tz)
    if (day !== ymd) continue
    if (log.staffId && staffIds.includes(log.staffId)) {
      result.set(log.staffId, true)
    } else {
      let sid: string | undefined
      for (const k of deviceUserIdLookupKeys(log.deviceUserId)) {
        sid = deviceToStaff.get(k)
        if (sid) break
      }
      if (sid) result.set(sid, true)
    }
  }

  return result
}

export async function loadOverridesForDate(
  staffIds: string[],
  ymd: string
): Promise<Map<string, { manualPresent: boolean; lateReason: string; manualAbsent: boolean }>> {
  const map = new Map<string, { manualPresent: boolean; lateReason: string; manualAbsent: boolean }>()
  if (staffIds.length === 0) return map
  const rows = await prisma.attendanceDayOverride.findMany({
    where: { date: ymd, staffId: { in: staffIds } }
  })
  for (const r of rows) {
    map.set(r.staffId, {
      manualPresent: r.manualPresent,
      lateReason: r.lateReason ?? '',
      manualAbsent: r.manualAbsent
    })
  }
  return map
}

export function parseNotifyLog(raw: string | undefined): Record<string, string[]> {
  if (!raw?.trim()) return {}
  try {
    const o = JSON.parse(raw) as unknown
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const out: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(o)) {
        if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = v
      }
      return out
    }
  } catch {
    // ignore
  }
  return {}
}

export function mergeNotifyLog(
  log: Record<string, string[]>,
  dateYmd: string,
  staffIds: string[]
): Record<string, string[]> {
  const next = { ...log }
  const existing = new Set(next[dateYmd] ?? [])
  for (const id of staffIds) existing.add(id)
  next[dateYmd] = [...existing]
  return next
}

export interface PresenceDetail {
  status: PresenceStatus
  lateReason: string
  graceEndsAtIso?: string
  isExpected: boolean
  /** True when marked present via manual override (not only punch-in). */
  manualPresent: boolean
  /** Staff profile: exempt from punch clock. */
  punchExempt: boolean
  /** Punch-exempt only: explicitly absent this day. */
  manualAbsent: boolean
}

export async function buildPresenceForDate(params: {
  dateYmd: string
  tz: string
  now?: Date
  graceMinutes: number
}): Promise<{
  presenceByStaffId: Record<string, PresenceDetail>
  scheduled: ScheduledRow[]
  off: { staffId: string; staffName: string; staffFirstName: string }[]
  onVacation: { staffId: string; staffName: string; staffFirstName: string }[]
  weekStart: string
  todayYmd: string
}> {
  const now = params.now ?? new Date()
  const { dateYmd, tz, graceMinutes } = params
  const { weekStart, scheduled, off, onVacation } = await loadRosterForCalendarYmd(dateYmd, tz)
  const todayYmd = tz === BUSINESS_TIME_ZONE ? toYmdInBusinessTz(now) : calendarYmdInTz(now, tz)
  const excluded = buildExcludedStaffIds(off, onVacation)

  const uniqueStaffIds = [...new Set(scheduled.map((s) => s.staffId))]
  const [punchMap, overrideMap, punchExemptRows] = await Promise.all([
    loadPunchFlagsForStaffOnDate(uniqueStaffIds, dateYmd, tz),
    loadOverridesForDate(uniqueStaffIds, dateYmd),
    prisma.staff.findMany({
      where: { id: { in: uniqueStaffIds } },
      select: { id: true, punchExempt: true }
    })
  ])
  const punchExemptById = new Map(punchExemptRows.map((r) => [r.id, r.punchExempt]))

  const presenceByStaffId: Record<string, PresenceDetail> = {}

  for (const staffId of uniqueStaffIds) {
    const isExpected = !excluded.has(staffId)
    const shiftStartHHmm = earliestShiftStartForStaff(scheduled, staffId)
    const hasPunch = punchMap.get(staffId) === true
    const ov = overrideMap.get(staffId)
    const manualPresent = ov?.manualPresent === true
    const manualAbsent = ov?.manualAbsent === true
    const lateReason = ov?.lateReason ?? ''
    const punchExempt = punchExemptById.get(staffId) === true

    const shiftStart = shiftStartInstantOnDate(dateYmd, shiftStartHHmm, tz)
    const graceEnd = addMinutes(shiftStart, graceMinutes)

    const status = computePresenceStatus({
      dateYmd,
      todayYmd,
      now,
      graceMinutes,
      shiftStartHHmm,
      tz,
      hasPunch,
      manualPresent,
      isExpected,
      punchExempt,
      manualAbsent
    })

    presenceByStaffId[staffId] = {
      status,
      lateReason,
      isExpected,
      manualPresent,
      punchExempt,
      manualAbsent,
      graceEndsAtIso: status === 'pending' && isExpected ? graceEnd.toISOString() : undefined
    }
  }

  return {
    presenceByStaffId,
    scheduled,
    off,
    onVacation,
    weekStart,
    todayYmd
  }
}

export { parseRecipientEmails } from '@/lib/eod-email'
