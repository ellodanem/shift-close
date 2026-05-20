/** Client-side roster week helpers (shared by /roster and /roster/mobile). */

export const ROSTER_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export interface RosterEntryClient {
  id?: string
  rosterWeekId?: string
  staffId: string
  date: string
  shiftTemplateId: string | null
  position?: string | null
  notes?: string | null
}

export interface RosterStaffClient {
  id: string
  name: string
  firstName?: string
  status: string
  role: string
  /** YYYY-MM-DD — staff appear on rosters from this date onward */
  startDate?: string | null
  mobileNumber?: string | null
  dateOfBirth?: string | null
  vacationStart?: string | null
  vacationEnd?: string | null
}

export function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  if (day !== 1) d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatInputDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  date.setDate(date.getDate() + days)
  return formatInputDate(date)
}

/** Map any YYYY-MM-DD (e.g. date-picker value) to that week's Monday for roster lookup. */
export function weekStartMondayFromDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return formatInputDate(getMonday(new Date(y, m - 1, d)))
}

export function weekDatesFromStart(weekStart: string): string[] {
  return ROSTER_DAY_LABELS.map((_, idx) => addDays(weekStart, idx))
}

export function isPastRosterWeek(weekStart: string): boolean {
  const today = formatInputDate(new Date())
  return today >= addDays(weekStart, 6)
}

export function isOnVacation(staff: RosterStaffClient, date: string): boolean {
  const start = staff.vacationStart
  const end = staff.vacationEnd
  return !!(start && end && date >= start && date <= end)
}

/** True when staff may appear on the roster grid for this calendar week (Mon–Sun). */
export function staffStartedOnOrBeforeWeek(staff: RosterStaffClient, weekStart: string): boolean {
  const start = staff.startDate?.trim()
  if (!start) return true
  const weekEnd = addDays(weekStart, 6)
  return start <= weekEnd
}

function isNonManagerRosterStaff(staff: RosterStaffClient): boolean {
  return staff.role !== 'manager'
}

export function displayStaffForWeek(
  allStaff: RosterStaffClient[],
  weekStart: string,
  entries: RosterEntryClient[]
): RosterStaffClient[] {
  const rosterStaff = allStaff.filter(
    (s) => isNonManagerRosterStaff(s) && staffStartedOnOrBeforeWeek(s, weekStart)
  )
  const activeForRoster = rosterStaff.filter((s) => s.status === 'active')
  if (!isPastRosterWeek(weekStart)) return activeForRoster
  const entryStaffIds = new Set(entries.map((e) => e.staffId))
  const inactiveWithEntries = allStaff.filter(
    (s) =>
      isNonManagerRosterStaff(s) &&
      s.status !== 'active' &&
      entryStaffIds.has(s.id) &&
      staffStartedOnOrBeforeWeek(s, weekStart)
  )
  return [...activeForRoster, ...inactiveWithEntries]
}

export function buildFullWeekEntries(params: {
  displayStaff: RosterStaffClient[]
  weekDates: string[]
  snapshot: RosterEntryClient[]
  stationClosedDates: Set<string>
}): Array<{
  staffId: string
  date: string
  shiftTemplateId: string | null
  position: string | null
  notes: string
}> {
  const { displayStaff, weekDates, snapshot, stationClosedDates } = params
  return displayStaff.flatMap((s) =>
    weekDates.map((date) => {
      const entry = snapshot.find((e) => e.staffId === s.id && e.date === date)
      const stationClosedDay = stationClosedDates.has(date)
      return {
        staffId: s.id,
        date,
        shiftTemplateId: stationClosedDay ? null : entry?.shiftTemplateId ?? null,
        position: entry?.position ?? null,
        notes: entry?.notes ?? ''
      }
    })
  )
}

export function staffDisplayName(s: { name: string; firstName?: string }): string {
  return s.firstName?.trim() || s.name
}

export interface ShiftTemplateRef {
  id: string
  name: string
  color?: string | null
}

export interface DayShiftCountItem {
  key: string
  label: string
  count: number
  color?: string | null
}

/** Per calendar day: shift template id (or "off") → headcount. Matches desktop /roster logic. */
export function buildCountByDayAndShift(params: {
  weekDates: string[]
  entries: RosterEntryClient[]
  displayStaffCount: number
  templates: ShiftTemplateRef[]
}): Map<string, Map<string, number>> {
  const { weekDates, entries, displayStaffCount, templates } = params
  const byDay = new Map<string, Map<string, number>>()
  for (const date of weekDates) {
    const dayEntries = entries.filter((e) => e.date === date)
    const shiftCounts = new Map<string, number>()
    templates.forEach((t) => shiftCounts.set(t.id, 0))
    shiftCounts.set('off', 0)
    for (const e of dayEntries) {
      const key = e.shiftTemplateId ?? 'off'
      shiftCounts.set(key, (shiftCounts.get(key) ?? 0) + 1)
    }
    const assigned = dayEntries.length
    shiftCounts.set('off', displayStaffCount - assigned)
    byDay.set(date, shiftCounts)
  }
  return byDay
}

export function dayShiftCountItems(
  counts: Map<string, number> | undefined,
  templates: ShiftTemplateRef[]
): DayShiftCountItem[] {
  if (!counts) return []
  const items: DayShiftCountItem[] = []
  for (const t of templates) {
    const n = counts.get(t.id) ?? 0
    if (n > 0) items.push({ key: t.id, label: t.name, count: n, color: t.color ?? null })
  }
  const offCount = counts.get('off') ?? 0
  if (offCount > 0) items.push({ key: 'off', label: 'Off', count: offCount })
  return items
}

export function onShiftCountForDay(counts: Map<string, number> | undefined): number {
  if (!counts) return 0
  let total = 0
  counts.forEach((n, k) => {
    if (k !== 'off') total += n
  })
  return total
}
