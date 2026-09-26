import { addCalendarDaysYmd, isYmd } from '@/lib/datetime-policy'
import { parsePayCycle, type PayCycle } from '@/lib/pay-cycle'

export const LOAN_TERM_UNITS = ['months', 'pays'] as const
export type LoanTermUnit = (typeof LOAN_TERM_UNITS)[number]

export const LOAN_STATUSES = ['active', 'paid', 'cancelled'] as const
export type LoanStatus = (typeof LOAN_STATUSES)[number]

/** Pays in a calendar month for each cycle. Semi-monthly is 1–15 / 16–end. */
export const PAYS_PER_MONTH: Record<PayCycle, number> = {
  weekly: 4,
  biweekly: 2,
  semimonthly: 2,
  monthly: 1
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

export function parseLoanTermUnit(value: unknown): LoanTermUnit {
  return value === 'pays' ? 'pays' : 'months'
}

export function parseLoanStatus(value: unknown): LoanStatus {
  return typeof value === 'string' && (LOAN_STATUSES as readonly string[]).includes(value)
    ? (value as LoanStatus)
    : 'active'
}

export function paysForLoanTerm(cycle: PayCycle, count: unknown, unit: LoanTermUnit): number {
  const n = typeof count === 'number' ? count : Number(count)
  const whole = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1
  if (unit === 'pays') return whole
  return whole * PAYS_PER_MONTH[parsePayCycle(cycle)]
}

/** Regular installment; the last pay takes leftover cents via remaining. */
export function loanInstallment(principal: number, termPays: number): number {
  const pays = Math.max(1, Math.floor(termPays))
  return round2(Math.max(0, principal) / pays)
}

/** How many pays a chosen installment needs. Leftover cents stay on the last pay. */
export function termPaysForInstallment(principal: number, installment: number): number {
  const total = parseMoney(principal)
  const due = parseMoney(installment)
  if (total <= 0) return 1
  if (due <= 0 || due >= total) return 1
  const pays = Math.max(1, Math.floor((total + 1e-6) / due))
  const leftover = loanRemaining(total, due * pays)
  if (leftover >= 1) return pays + 1
  return pays
}

export function loanRemaining(principal: number, paid: number): number {
  return round2(Math.max(0, parseMoney(principal) - parseMoney(paid)))
}

export function loanThisPay(installment: number, remaining: number): number {
  const due = parseMoney(installment)
  const left = parseMoney(remaining)
  if (left <= due) return left
  // Leftover cents on the last pay are slightly above the rounded installment.
  if (round2(left - due) < 1) return left
  return due
}

export function lastLoanInstallment(principal: number, termPays: number, installment?: number): number {
  const pays = Math.max(1, Math.floor(termPays))
  const regular = parseMoney(installment) > 0 ? parseMoney(installment) : loanInstallment(principal, pays)
  if (pays <= 1) return parseMoney(principal)
  return loanRemaining(principal, regular * (pays - 1))
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  if (!isYmd(ymd)) return null
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m, d }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addMonthsYmd(ymd: string, months: number): string {
  const parsed = parseYmd(ymd)
  if (!parsed) return ymd
  const idx = parsed.m - 1 + months
  const year = parsed.y + Math.floor(idx / 12)
  const month = ((idx % 12) + 12) % 12 + 1
  const day = Math.min(parsed.d, daysInMonth(year, month))
  return formatYmd(year, month, day)
}

export function nextPayDate(ymd: string, cycle: PayCycle): string {
  const parsed = parseYmd(ymd)
  if (!parsed) return ymd
  if (cycle === 'weekly') return addCalendarDaysYmd(ymd, 7)
  if (cycle === 'biweekly') return addCalendarDaysYmd(ymd, 14)
  if (cycle === 'monthly') return addMonthsYmd(ymd, 1)
  const last = daysInMonth(parsed.y, parsed.m)
  if (parsed.d < 15) return formatYmd(parsed.y, parsed.m, 15)
  if (parsed.d < last) return formatYmd(parsed.y, parsed.m, last)
  const following = addMonthsYmd(formatYmd(parsed.y, parsed.m, 1), 1)
  const next = parseYmd(following)
  if (!next) return ymd
  return formatYmd(next.y, next.m, 15)
}

export function expectedLastPayDate(startDate: string, cycle: PayCycle, termPays: number): string {
  const pays = Math.max(1, Math.floor(termPays))
  let date = startDate
  for (let i = 1; i < pays; i += 1) {
    date = nextPayDate(date, parsePayCycle(cycle))
  }
  return date
}

export type ActiveLoanDeduction = {
  installment: number
  remaining: number
}

/** Balanced loan wins over the legacy open-ended staff.staffLoan amount. */
export function effectiveStaffLoanDeduction(
  legacyAmount: number | null | undefined,
  loan?: ActiveLoanDeduction | null
): number {
  if (loan && loan.remaining > 0) return loanThisPay(loan.installment, loan.remaining)
  return parseMoney(legacyAmount)
}

export function capStaffLoanDeduction(
  requested: number,
  remaining: number | null | undefined
): number {
  if (remaining == null) return parseMoney(requested)
  return loanThisPay(requested, remaining)
}

export function previewStaffLoan(input: {
  principal: number
  termCount: number
  termUnit: LoanTermUnit
  cycle: PayCycle
  startDate: string
  installment?: number
}): {
  termPays: number
  installment: number
  lastInstallment: number
  lastPayDate: string
} {
  const custom = parseMoney(input.installment)
  if (custom > 0) {
    const installment = Math.min(custom, parseMoney(input.principal) || custom)
    const termPays = termPaysForInstallment(input.principal, installment)
    return {
      termPays,
      installment,
      lastInstallment: lastLoanInstallment(input.principal, termPays, installment),
      lastPayDate: expectedLastPayDate(input.startDate, input.cycle, termPays)
    }
  }
  const termPays = paysForLoanTerm(input.cycle, input.termCount, input.termUnit)
  const installment = loanInstallment(input.principal, termPays)
  return {
    termPays,
    installment,
    lastInstallment: lastLoanInstallment(input.principal, termPays, installment),
    lastPayDate: expectedLastPayDate(input.startDate, input.cycle, termPays)
  }
}
