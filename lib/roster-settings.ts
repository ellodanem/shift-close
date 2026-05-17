import { isOnVacation, type RosterEntryClient, type RosterStaffClient } from '@/lib/roster-week-client'

export const ROSTER_MIN_OFF_DAYS_PER_WEEK_KEY = 'roster_min_off_days_per_week'
export const ROSTER_MIN_OFF_DAYS_PER_WEEK_DEFAULT = 1

export function parseMinOffDaysPerWeek(value: string | null | undefined): number {
  const n = parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n < 0) return ROSTER_MIN_OFF_DAYS_PER_WEEK_DEFAULT
  return Math.min(7, n)
}

export function countOffDaysForStaffInWeek(params: {
  staff: RosterStaffClient
  weekDates: string[]
  entries: RosterEntryClient[]
  stationClosedDates: Set<string>
  isOnSickLeave: (staffId: string, date: string) => boolean
}): number {
  const { staff, weekDates, entries, stationClosedDates, isOnSickLeave } = params
  let count = 0
  for (const date of weekDates) {
    if (stationClosedDates.has(date)) continue
    if (isOnVacation(staff, date) || isOnSickLeave(staff.id, date)) {
      count++
      continue
    }
    const entry = entries.find((e) => e.staffId === staff.id && e.date === date)
    if (!entry?.shiftTemplateId) count++
  }
  return count
}

export function staffIdsBelowMinOffDays(params: {
  displayStaff: RosterStaffClient[]
  weekDates: string[]
  entries: RosterEntryClient[]
  stationClosedDates: Set<string>
  minOffDays: number
  isOnSickLeave: (staffId: string, date: string) => boolean
}): Set<string> {
  const flagged = new Set<string>()
  if (params.minOffDays <= 0) return flagged
  for (const staff of params.displayStaff) {
    const offDays = countOffDaysForStaffInWeek({
      staff,
      weekDates: params.weekDates,
      entries: params.entries,
      stationClosedDates: params.stationClosedDates,
      isOnSickLeave: params.isOnSickLeave
    })
    if (offDays < params.minOffDays) flagged.add(staff.id)
  }
  return flagged
}
