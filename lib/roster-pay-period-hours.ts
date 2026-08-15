import { addDays } from '@/lib/roster-week-client'

/** Soft weekly target while building a roster. */
export const ROSTER_WEEK_TARGET_HOURS = 40

/** Soft pay-period target (typically two 40h weeks; actual window varies with extraction). */
export const ROSTER_PAY_PERIOD_TARGET_HOURS = 80

/** Cap how far back we load prior-week roster rows for the open period. */
export const ROSTER_OPEN_PERIOD_MAX_DAYS = 62

const HM = /^(\d{1,2}):(\d{2})$/

export type RosterHoursEntry = {
  staffId: string
  date: string
  shiftTemplateId: string | null
}

export type RosterHoursTemplate = {
  startTime: string
  endTime: string
}

export type StaffPayPeriodHours = {
  periodHours: number
  weekHours: number
}

function minutesFromHm(value: string): number | null {
  const m = HM.exec(value.trim())
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Scheduled length of a shift preset. Overnight (end ≤ start) wraps midnight. */
export function hoursFromShiftTimes(startTime: string, endTime: string): number {
  const start = minutesFromHm(startTime)
  const end = minutesFromHm(endTime)
  if (start == null || end == null) return 0
  if (end === start) return 0
  const minutes = end > start ? end - start : end + 24 * 60 - start
  return Math.round((minutes / 60) * 100) / 100
}

export function rosterHoursEntryKey(staffId: string, date: string): string {
  return `${staffId}|${date}`
}

/**
 * Open pay period starts the day after the last extracted (saved) period ended.
 * If none exists, use the 1st of the current month. Lookback is capped.
 */
export function resolveOpenPayPeriodStart(params: {
  lastPeriodEndDate: string | null
  todayYmd: string
  weekEndYmd: string
  maxDays?: number
}): string {
  const maxDays = params.maxDays ?? ROSTER_OPEN_PERIOD_MAX_DAYS
  const raw = params.lastPeriodEndDate
    ? addDays(params.lastPeriodEndDate, 1)
    : `${params.todayYmd.slice(0, 7)}-01`
  const floor = addDays(params.weekEndYmd, -(maxDays - 1))
  return raw < floor ? floor : raw
}

export function formatRosterHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`
}

export function payPeriodHoursTone(
  periodHours: number
): 'under' | 'on_track' | 'over' {
  if (periodHours > ROSTER_PAY_PERIOD_TARGET_HOURS) return 'over'
  if (periodHours >= ROSTER_PAY_PERIOD_TARGET_HOURS * 0.8) return 'on_track'
  return 'under'
}

function shortDateLabel(ymd: string): string {
  const [, m, d] = ymd.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[Number(m) - 1] ?? m
  return `${Number(d)} ${month}`
}

export function payPeriodHoursTitle(params: {
  periodStart: string
  periodHours: number
  weekHours: number
}): string {
  const period = `${formatRosterHours(params.periodHours)} from ${shortDateLabel(params.periodStart)} (target ~${ROSTER_PAY_PERIOD_TARGET_HOURS}h)`
  const weekNote =
    params.weekHours > ROSTER_WEEK_TARGET_HOURS
      ? `This week ${formatRosterHours(params.weekHours)} (over ${ROSTER_WEEK_TARGET_HOURS}h target)`
      : `This week ${formatRosterHours(params.weekHours)} (target ${ROSTER_WEEK_TARGET_HOURS}h)`
  return `Pay period ${period}. ${weekNote}.`
}

export function buildPayPeriodHoursByStaff(params: {
  staffIds: Iterable<string>
  periodStart: string
  periodEnd: string
  weekStart: string
  weekEnd: string
  entries: RosterHoursEntry[]
  templatesById: Map<string, RosterHoursTemplate>
  zeroHourKeys?: Set<string>
}): Map<string, StaffPayPeriodHours> {
  const {
    periodStart,
    periodEnd,
    weekStart,
    weekEnd,
    entries,
    templatesById,
    zeroHourKeys
  } = params

  const hours = new Map<string, StaffPayPeriodHours>()
  for (const id of params.staffIds) {
    hours.set(id, { periodHours: 0, weekHours: 0 })
  }

  for (const entry of entries) {
    if (!entry.shiftTemplateId) continue
    if (entry.date < periodStart || entry.date > periodEnd) continue
    const row = hours.get(entry.staffId)
    if (!row) continue
    if (zeroHourKeys?.has(rosterHoursEntryKey(entry.staffId, entry.date))) continue
    const template = templatesById.get(entry.shiftTemplateId)
    if (!template) continue
    const add = hoursFromShiftTimes(template.startTime, template.endTime)
    if (add <= 0) continue
    row.periodHours = Math.round((row.periodHours + add) * 100) / 100
    if (entry.date >= weekStart && entry.date <= weekEnd) {
      row.weekHours = Math.round((row.weekHours + add) * 100) / 100
    }
  }

  return hours
}
