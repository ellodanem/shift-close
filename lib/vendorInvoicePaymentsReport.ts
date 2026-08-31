import { roundMoney } from '@/lib/fuelPayments'

export type VendorInvoicePaymentsInclude = 'paid' | 'all'

export interface VendorInvoicePaymentRow {
  vendorId: string
  vendorName: string
  /** Placeholder until cashbook expenses are wired in. */
  expenses: number
  /** Invoice total including VAT (amount + vat). */
  invoiceAmount: number
  /** Show "Paid" when every invoice in the row is paid. */
  paidLabel: boolean
  pendingCount: number
  paidCount: number
}

export interface MonthlyReportExpenseRow {
  id: string
  description: string
  amount: number
  paymentMethod: string | null
  ref: string | null
  inCashbook: boolean
}

export interface VendorInvoicePaymentsReport {
  month: string
  monthName: string
  include: VendorInvoicePaymentsInclude
  /** How the month filter was applied. */
  monthMeaning: 'payment' | 'invoice'
  rows: VendorInvoicePaymentRow[]
  /** Extra expense lines unique to this month’s report (not vendor invoices). */
  additionalExpenses: MonthlyReportExpenseRow[]
  totalExpenses: number
  totalInvoiceAmount: number
}

export function monthUtcBounds(month: string): { start: Date; endExclusive: Date; monthName: string } {
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const monthIndex = parseInt(monthStr, 10) - 1
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0))
  const endExclusive = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0))
  const monthName = new Date(Date.UTC(year, monthIndex, 15, 12, 0, 0, 0)).toLocaleDateString(
    'en-US',
    { month: 'long', year: 'numeric', timeZone: 'UTC' }
  )
  return { start, endExclusive, monthName }
}

interface AggregateInput {
  vendorId: string
  vendorName: string
  /** Per-invoice total including VAT. */
  amount: number
  status: 'pending' | 'paid'
}

export function aggregateVendorInvoiceRows(inputs: AggregateInput[]): VendorInvoicePaymentRow[] {
  const byVendor = new Map<
    string,
    {
      vendorId: string
      vendorName: string
      invoiceAmount: number
      pendingCount: number
      paidCount: number
    }
  >()

  for (const row of inputs) {
    const amount = roundMoney(row.amount)
    const existing = byVendor.get(row.vendorId)
    if (!existing) {
      byVendor.set(row.vendorId, {
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        invoiceAmount: amount,
        pendingCount: row.status === 'pending' ? 1 : 0,
        paidCount: row.status === 'paid' ? 1 : 0
      })
      continue
    }
    existing.invoiceAmount = roundMoney(existing.invoiceAmount + amount)
    if (row.status === 'pending') existing.pendingCount += 1
    else existing.paidCount += 1
  }

  return Array.from(byVendor.values())
    .map((v) => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      expenses: 0,
      invoiceAmount: v.invoiceAmount,
      paidLabel: v.pendingCount === 0 && v.paidCount > 0,
      pendingCount: v.pendingCount,
      paidCount: v.paidCount
    }))
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName, undefined, { sensitivity: 'base' }))
}

export function serializeMonthlyReportExpense(row: {
  id: string
  description: string
  amount: number
  paymentMethod: string | null
  ref: string | null
  cashbookEntryId: string | null
}): MonthlyReportExpenseRow {
  return {
    id: row.id,
    description: row.description,
    amount: roundMoney(row.amount),
    paymentMethod: row.paymentMethod,
    ref: row.ref,
    inCashbook: Boolean(row.cashbookEntryId)
  }
}

export function dateInReportMonth(dateYmd: string, month: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateYmd) && dateYmd.startsWith(`${month}-`)
}

export function monthDateBoundsYmd(month: string): { min: string; max: string } {
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const monthIndex = parseInt(monthStr, 10) - 1
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0, 0)).getUTCDate()
  return {
    min: `${month}-01`,
    max: `${month}-${String(lastDay).padStart(2, '0')}`
  }
}

export function buildReportTotals(
  rows: VendorInvoicePaymentRow[],
  additionalExpenses: { amount: number }[] = []
): {
  totalExpenses: number
  totalInvoiceAmount: number
} {
  const vendorExpenses = rows.reduce((sum, r) => sum + r.expenses, 0)
  const extraExpenses = additionalExpenses.reduce((sum, e) => sum + e.amount, 0)
  return {
    totalExpenses: roundMoney(vendorExpenses + extraExpenses),
    totalInvoiceAmount: roundMoney(rows.reduce((sum, r) => sum + r.invoiceAmount, 0))
  }
}
