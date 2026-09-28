/** Weekday pair. Sunday is the single custom shift. */
export const STANDARD_SHIFT_NAMES = ['6-1', '1-9'] as const
export const SUNDAY_SHIFT_NAME = '7:30 - 2'

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
] as const

export type ShiftDaySlice = {
  date: string
  shift: string
  status: string
}

export type ClosedDayMoneyShift = ShiftDaySlice & {
  deposits: unknown
  systemDebit: number | null
  otherCredit: number | null
  overShortTotal: number | null
  osReviewed: number | null
  osLegitAsIs: boolean
}

export type LastClosedDayMoney = {
  deposits: number
  debit: number
  credit: number
  overShort: number
}

/** One fuel-comparison day: the latest date with this year's volume recorded. */
export type FuelComparisonRecordedDay = {
  date: string
  year: number
  month: number
  prevYear: number
  gasLitresCur: number
  gasLitresPrev: number
  dieselLitresCur: number
  dieselLitresPrev: number
  gasGallonsCur: number
  gasGallonsPrev: number
  dieselGallonsCur: number
  dieselGallonsPrev: number
  totalGallonsCur: number
  totalGallonsPrev: number
  variance: number
  hasMissingShiftData: boolean
  /** Current month uses the last recorded day. Earlier months use the last calendar day. */
  dayBasis: 'recorded' | 'month-end'
}

export type FuelGradeGlance = {
  gasGallonsCur: number
  gasGallonsPrev: number
  dieselGallonsCur: number
  dieselGallonsPrev: number
  totalGallonsCur: number
  totalGallonsPrev: number
  variance: number
}

export type LastClosedDaySnapshot = LastClosedDayMoney & {
  date: string
  weekdayName: string
  shiftLabel: string
  fuel: {
    year: number
    month: number
    prevYear: number
    hasMissingShiftData: boolean
    day: FuelGradeGlance
    accumulated: FuelGradeGlance
  } | null
}

export function weekdayNameFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ''
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  return WEEKDAYS[dt.getUTCDay()] ?? ''
}

/** A day is closed when the expected shifts are in and none are still drafts. */
export function isShiftDayClosed(shifts: ShiftDaySlice[]): boolean {
  if (shifts.length === 0) return false
  if (shifts.some((s) => s.status === 'draft')) return false
  const types = shifts.map((s) => s.shift)
  const hasStandard = types.some((s) => s === '6-1' || s === '1-9')
  const hasCustom = types.some((s) => s === SUNDAY_SHIFT_NAME)
  if (hasCustom && hasStandard) return false
  if (hasCustom) return shifts.length === 1
  return types.includes('6-1') && types.includes('1-9')
}

/** Latest complete shift day on or before asOfYmd. */
export function findLastClosedShiftDate(shifts: ShiftDaySlice[], asOfYmd: string): string | null {
  const byDate = new Map<string, ShiftDaySlice[]>()
  for (const shift of shifts) {
    if (shift.date > asOfYmd) continue
    const list = byDate.get(shift.date) ?? []
    list.push(shift)
    byDate.set(shift.date, list)
  }
  const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  for (const date of dates) {
    if (isShiftDayClosed(byDate.get(date) ?? [])) return date
  }
  return null
}

export function shiftDayLabel(shifts: { shift: string }[]): string {
  const names = [...new Set(shifts.map((s) => s.shift).filter(Boolean))]
  const n = shifts.length
  const count = `${n} shift${n === 1 ? '' : 's'}`
  return names.length > 0 ? `${count} · ${names.join(', ')}` : count
}

export function sumDepositAmounts(deposits: unknown): number {
  let amounts: unknown[] = []
  if (typeof deposits === 'string') {
    try {
      const parsed = JSON.parse(deposits || '[]')
      amounts = Array.isArray(parsed) ? parsed : []
    } catch {
      amounts = []
    }
  } else if (Array.isArray(deposits)) {
    amounts = deposits
  }
  return amounts
    .map((d) => Number(d))
    .filter((n) => !Number.isNaN(n) && n > 0)
    .reduce((sum, n) => sum + n, 0)
}

export function sumClosedDayMoney(shifts: ClosedDayMoneyShift[]): LastClosedDayMoney {
  let deposits = 0
  let debit = 0
  let credit = 0
  let overShort = 0
  for (const shift of shifts) {
    deposits += sumDepositAmounts(shift.deposits)
    debit += shift.systemDebit || 0
    credit += shift.otherCredit || 0
    overShort += shift.overShortTotal || 0
  }
  return { deposits, debit, credit, overShort }
}
