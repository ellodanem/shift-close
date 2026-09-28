import { payPeriodCycleNumber } from '@/lib/pay-cycle'

export const PAYROLL_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const

export const PAYROLL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const

export type PayRunSort = 'latest' | 'earliest'

export type PayRunListItem = {
  cycleNumber: number
  status: string
  startDate: string
  endDate: string
  payDate: string
}

/**
 * Year a run belongs to. Pay+ cycle numbers restart at 1 in January,
 * so the active financial year for this list is that calendar year.
 */
export function activePayrollYear(now = new Date()): number {
  return now.getFullYear()
}

export function payrollYearOf(endDate: string): number | null {
  const year = Number(endDate.slice(0, 4))
  return Number.isInteger(year) && year >= 1900 ? year : null
}

export function payrollMonthOf(endDate: string): number | null {
  const month = Number(endDate.slice(5, 7))
  return month >= 1 && month <= 12 ? month : null
}

export function shownCycleNumber(cycleNumber: number, endDate: string): number {
  if (cycleNumber > 0) return cycleNumber
  const derived = Number(payPeriodCycleNumber(endDate))
  return derived > 0 ? derived : 0
}

export function payrollYears(runs: Array<{ endDate: string }>, now = new Date()): number[] {
  const years = new Set<number>([activePayrollYear(now)])
  for (const run of runs) {
    const year = payrollYearOf(run.endDate)
    if (year) years.add(year)
  }
  return [...years].sort((a, b) => b - a)
}

export function payrollCycleOptions(
  runs: PayRunListItem[],
  year: number | 'all',
  month: number | 'all'
): number[] {
  const cycles = new Set<number>()
  for (const run of runs) {
    const runYear = payrollYearOf(run.endDate)
    const runMonth = payrollMonthOf(run.endDate)
    if (year !== 'all' && runYear !== year) continue
    if (month !== 'all' && runMonth !== month) continue
    const cycle = shownCycleNumber(run.cycleNumber, run.endDate)
    if (cycle > 0) cycles.add(cycle)
  }
  return [...cycles].sort((a, b) => a - b)
}

export function filterPayRuns<T extends PayRunListItem>(
  runs: T[],
  filter: {
    year: number | 'all'
    month: number | 'all'
    cycle: number | 'all'
    hideVoided: boolean
    sort: PayRunSort
  }
): T[] {
  const filtered = runs.filter((run) => {
    if (filter.hideVoided && run.status === 'void') return false
    const runYear = payrollYearOf(run.endDate)
    const runMonth = payrollMonthOf(run.endDate)
    const cycle = shownCycleNumber(run.cycleNumber, run.endDate)
    if (filter.year !== 'all' && runYear !== filter.year) return false
    if (filter.month !== 'all' && runMonth !== filter.month) return false
    if (filter.cycle !== 'all' && cycle !== filter.cycle) return false
    return true
  })

  const latest = filter.sort !== 'earliest'
  const cmpNum = (a: number, b: number) => (latest ? b - a : a - b)
  const cmpText = (a: string, b: string) => (a === b ? 0 : latest ? (a < b ? 1 : -1) : a < b ? -1 : 1)

  return filtered.slice().sort((a, b) => {
    const yearDiff = cmpNum(payrollYearOf(a.endDate) ?? 0, payrollYearOf(b.endDate) ?? 0)
    if (yearDiff) return yearDiff
    const cycleDiff = cmpNum(shownCycleNumber(a.cycleNumber, a.endDate), shownCycleNumber(b.cycleNumber, b.endDate))
    if (cycleDiff) return cycleDiff
    const endDiff = cmpText(a.endDate, b.endDate)
    if (endDiff) return endDiff
    return cmpText(a.payDate, b.payDate)
  })
}

export type PayrollStatusCounts = {
  draft: number
  processed: number
  void: number
}

export function payrollStatusCounts(runs: Array<{ status: string }>): PayrollStatusCounts {
  const counts: PayrollStatusCounts = { draft: 0, processed: 0, void: 0 }
  for (const run of runs) {
    if (run.status === 'draft' || run.status === 'processed' || run.status === 'void') {
      counts[run.status] += 1
    }
  }
  return counts
}

function ymdParts(ymd: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

function shortMonthDay(parts: { m: number; d: number }): string {
  return `${PAYROLL_MONTHS_SHORT[parts.m - 1]} ${parts.d}`
}

/** Calendar range for a run title, without a timezone shift. */
export function payRunRangeLabel(startDate: string, endDate: string): string {
  const start = ymdParts(startDate)
  const end = ymdParts(endDate)
  if (!start || !end) return `${startDate}–${endDate}`
  if (start.y === end.y && start.m === end.m && start.d === end.d) return shortMonthDay(start)
  if (start.y === end.y && start.m === end.m) return `${shortMonthDay(start)}–${end.d}`
  if (start.y === end.y) return `${shortMonthDay(start)}–${shortMonthDay(end)}`
  return `${shortMonthDay(start)}, ${start.y}–${shortMonthDay(end)}, ${end.y}`
}

export function payRunListTitle(cycleNumber: number, startDate: string, endDate: string): string {
  const range = payRunRangeLabel(startDate, endDate)
  const cycle = shownCycleNumber(cycleNumber, endDate)
  return cycle > 0 ? `Cycle ${cycle} · ${range}` : range
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseMoney(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return round2(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return round2(n)
  }
  return 0
}

export function payRunTotals(lines: Array<{ grossPay?: unknown; netPay?: unknown }> | undefined): {
  gross: number
  net: number
} {
  let gross = 0
  let net = 0
  for (const line of lines ?? []) {
    gross += parseMoney(line.grossPay)
    net += parseMoney(line.netPay)
  }
  return { gross: round2(gross), net: round2(net) }
}
