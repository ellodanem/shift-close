import { weekdayNameFromYmd } from '@/lib/last-closed-day'

export type CashbookLatestAllocation = {
  amount: number
  category: { type: string; name: string }
}

export type CashbookLatestSource = {
  date: string
  description: string
  createdAt: Date | string
  paymentMethod: string | null
  allocations: CashbookLatestAllocation[]
}

export type CashbookLatestLine = {
  date: string
  description: string
  amount: number
  lineCount: number
  paymentLabel: string | null
}

export type CashbookLatestSnapshot = {
  lastDeposit: (CashbookLatestLine & { bankStatus: 'pending' | 'cleared' | 'discrepancy' | null }) | null
  lastExpense: CashbookLatestLine | null
  behindMessage: string | null
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  deposit: 'Deposit',
  eft: 'EFT',
  direct_debit: 'Direct debit',
  debit_credit: 'Debit/Credit'
}

export function cashbookPaymentLabel(method: string | null | undefined): string {
  const key = (method || 'cash').toLowerCase()
  return PAYMENT_LABELS[key] ?? method ?? 'Cash'
}

export function isDepositAllocation(allocation: CashbookLatestAllocation): boolean {
  return (
    (allocation.category.type || 'expense') === 'income' &&
    /^deposit$/i.test(allocation.category.name.trim())
  )
}

export function isExpenseAllocation(allocation: CashbookLatestAllocation): boolean {
  return (allocation.category.type || 'expense') === 'expense'
}

function createdAtMs(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function allocationSum(
  entry: CashbookLatestSource,
  match: (allocation: CashbookLatestAllocation) => boolean
): number {
  return entry.allocations.filter(match).reduce((sum, allocation) => sum + (allocation.amount || 0), 0)
}

export function summarizeDepositsOnLatestDate(entries: CashbookLatestSource[]): CashbookLatestLine | null {
  const deposits = entries.filter((entry) => entry.allocations.some(isDepositAllocation))
  if (deposits.length === 0) return null
  const latestDate = deposits.reduce((max, entry) => (entry.date > max ? entry.date : max), deposits[0].date)
  const dayRows = deposits.filter((entry) => entry.date === latestDate)
  const descriptions = [...new Set(dayRows.map((entry) => entry.description.trim()).filter(Boolean))]
  return {
    date: latestDate,
    description: descriptions.length === 1 ? descriptions[0] : 'Deposits',
    amount: dayRows.reduce((sum, entry) => sum + allocationSum(entry, isDepositAllocation), 0),
    lineCount: dayRows.length,
    paymentLabel: null
  }
}

export function summarizeLatestExpense(entries: CashbookLatestSource[]): CashbookLatestLine | null {
  const expenses = entries.filter((entry) => entry.allocations.some(isExpenseAllocation))
  if (expenses.length === 0) return null
  const latest = [...expenses].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return createdAtMs(b.createdAt) - createdAtMs(a.createdAt)
  })[0]
  return {
    date: latest.date,
    description: latest.description.trim() || 'Expense',
    amount: allocationSum(latest, isExpenseAllocation),
    lineCount: 1,
    paymentLabel: cashbookPaymentLabel(latest.paymentMethod)
  }
}

export function cashbookBehindMessage(lastDepositDate: string | null, closedDate: string | null): string | null {
  if (!closedDate || !lastDepositDate || lastDepositDate >= closedDate) return null
  const depositDay = weekdayNameFromYmd(lastDepositDate)
  const closedDay = weekdayNameFromYmd(closedDate)
  return `Last deposit is ${depositDay}. ${closedDay}'s shift is closed and not in the book yet.`
}
