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

export function isPastRosterWeek(weekStart: string, today = formatInputDate(new Date())): boolean {
  return today >= addDays(weekStart, 6)
}

export function currentWeekMonday(today = formatInputDate(new Date())): string {
  const [y, m, d] = today.split('-').map(Number)
  return formatInputDate(getMonday(new Date(y, (m ?? 1) - 1, d ?? 1)))
}

export function isCurrentRosterWeek(weekStart: string, today = formatInputDate(new Date())): boolean {
  return weekStart === currentWeekMonday(today)
}

/** Calendar day is read-only on the active week once the day has started (date ≤ today). */
export function isRosterDayLocked(
  date: string,
  weekStart: string,
  today = formatInputDate(new Date())
): boolean {
  if (isPastRosterWeek(weekStart, today)) return true
  if (!isCurrentRosterWeek(weekStart, today)) return false
  return date <= today
}

export function rosterEntryKey(staffId: string, date: string): string {
  return `${staffId}|${date}`
}

export function previousWeekReferenceDate(date: string): string {
  return addDays(date, -7)
}

export function formatRosterDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}-${m}-${y.slice(2)}`
}

export function previousWeekShiftLabel(
  entry: RosterEntryClient | undefined,
  templateNameById: Map<string, string>
): string {
  if (!entry) return 'Not scheduled'
  if (!entry.shiftTemplateId) return 'Off'
  return templateNameById.get(entry.shiftTemplateId) ?? 'Shift'
}

export function previousWeekTooltip(
  cellDate: string,
  entry: RosterEntryClient | undefined,
  templateNameById: Map<string, string>
): string {
  const prevDate = previousWeekReferenceDate(cellDate)
  const label = previousWeekShiftLabel(entry, templateNameById)
  return `Last week (${formatRosterDisplayDate(prevDate)}): ${label}`
}

/** Keep locked calendar days from server snapshot when saving the current week. */
export function mergeEntriesRespectingDayLock(params: {
  weekStart: string
  incoming: Array<{
    staffId: string
    date: string
    shiftTemplateId: string | null
    position: string | null
    notes: string
  }>
  serverSnapshot: RosterEntryClient[]
  today?: string
}): Array<{
  staffId: string
  date: string
  shiftTemplateId: string | null
  position: string | null
  notes: string
}> {
  const { weekStart, incoming, serverSnapshot, today = formatInputDate(new Date()) } = params
  const serverByKey = new Map(
    serverSnapshot.map((e) => [
      rosterEntryKey(e.staffId, e.date),
      {
        staffId: e.staffId,
        date: e.date,
        shiftTemplateId: e.shiftTemplateId ?? null,
        position: e.position ?? null,
        notes: e.notes ?? ''
      }
    ])
  )
  return incoming.map((row) => {
    if (!isRosterDayLocked(row.date, weekStart, today)) return row
    const locked = serverByKey.get(rosterEntryKey(row.staffId, row.date))
    if (locked) return locked
    return {
      ...row,
      shiftTemplateId: null,
      position: null,
      notes: ''
    }
  })
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

/** Inactive staff still shown on a week they were scheduled for (read-only "ghost" rows). */
export function isGhostRosterStaff(staff: RosterStaffClient): boolean {
  return staff.status !== 'active'
}

export const GHOST_ROSTER_STAFF_TITLE = 'Inactive — scheduled before leaving'

export function inactiveRosterStaffWithWeekEntries(
  allStaff: RosterStaffClient[],
  weekStart: string,
  entries: RosterEntryClient[]
): RosterStaffClient[] {
  const entryStaffIds = new Set(entries.map((e) => e.staffId))
  return allStaff.filter(
    (s) =>
      isNonManagerRosterStaff(s) &&
      isGhostRosterStaff(s) &&
      entryStaffIds.has(s.id) &&
      staffStartedOnOrBeforeWeek(s, weekStart)
  )
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
  const inactiveWithEntries = inactiveRosterStaffWithWeekEntries(allStaff, weekStart, entries)
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
  displayStaffIds: Set<string> | string[]
  templates: ShiftTemplateRef[]
}): Map<string, Map<string, number>> {
  const { weekDates, entries, displayStaffIds, templates } = params
  const staffIds =
    displayStaffIds instanceof Set ? displayStaffIds : new Set(displayStaffIds)
  const displayStaffCount = staffIds.size
  const byDay = new Map<string, Map<string, number>>()
  for (const date of weekDates) {
    const dayEntries = entries.filter((e) => e.date === date && staffIds.has(e.staffId))
    const shiftCounts = new Map<string, number>()
    templates.forEach((t) => shiftCounts.set(t.id, 0))
    shiftCounts.set('off', 0)
    for (const e of dayEntries) {
      const key = e.shiftTemplateId ?? 'off'
      shiftCounts.set(key, (shiftCounts.get(key) ?? 0) + 1)
    }
    const assigned = dayEntries.length
    shiftCounts.set('off', Math.max(0, displayStaffCount - assigned))
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
