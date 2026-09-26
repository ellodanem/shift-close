import { payPeriodCycleNumber } from '@/lib/pay-cycle'

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
