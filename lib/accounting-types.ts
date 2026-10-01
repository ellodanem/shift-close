export type LedgerRow = {
  date: string
  description: string
  category: string
  debit: number
  credit: number
  balance: number
  source: string
  fromShift: boolean
}

export type CategoryTotal = {
  name: string
  type: string
  amount: number
}

export type CustomerRow = {
  name: string
  opening: number
  charges: number
  payments: number
  closing: number
  lastPayment: string | null
}

export type AgingRow = {
  name: string
  total: number
  d0_30: number
  d31_60: number
  d61_90: number
  d90: number
  /** Snapshot balance with no ledger lines to age. */
  unaged: number
}

export type OpenBill = {
  kind: 'fuel' | 'vendor'
  name: string
  number: string
  date: string
  due: string | null
  amount: number
  account: string
}

export type PaidBill = {
  date: string
  name: string
  ref: string
  amount: number
  account: string
}

export type VendorRow = {
  name: string
  openAmount: number
  lastPayment: string | null
}

export type ReconcileRow = {
  shiftId: string
  date: string
  description: string
  recordKind: 'deposit' | 'debit'
  lineIndex: number
  amount: number
  bankStatus: string
  shift: string
}

export type UncashedRow = {
  date: string
  payee: string
  ref: string
  amount: number
}

export type ReceiptRow = {
  date: string
  label: string
  href: string | null
  linked: string
}

export type PayRunRow = {
  id: string
  period: string
  payDate: string
  status: string
  net: number
  gross: number
}

export type AccountingBooks = {
  month: string
  startDate: string
  endDate: string
  asOf: string
  westlineOnFile: number
  serviceStationOnFile: number
  accountsReceivable: number
  accountsPayableFuel: number
  accountsPayableVendors: number
  payrollPayable: number
  monthIncome: number
  monthExpense: number
  monthNet: number
  ledger: LedgerRow[]
  categories: CategoryTotal[]
  customers: CustomerRow[]
  aging: AgingRow[]
  openBills: OpenBill[]
  paidBills: PaidBill[]
  vendors: VendorRow[]
  reconcile: ReconcileRow[]
  uncashedChecks: UncashedRow[]
  receipts: ReceiptRow[]
  payRuns: PayRunRow[]
}

export type AgingBuckets = {
  total: number
  d0_30: number
  d31_60: number
  d61_90: number
  d90: number
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Oldest charges are cleared first. Payments after `asOf` are ignored. */
export function agingFromLines(
  lines: Array<{ date: string; lineType: string; amount: number }>,
  asOf: string
): AgingBuckets {
  const sorted = lines
    .filter((line) => line.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))
  const open: Array<{ date: string; remaining: number }> = []
  for (const line of sorted) {
    const amt = Math.abs(Number(line.amount) || 0)
    if (amt <= 0) continue
    if (line.lineType === 'charge') {
      open.push({ date: line.date, remaining: amt })
      continue
    }
    if (line.lineType !== 'payment') continue
    let left = amt
    for (const item of open) {
      if (left <= 0) break
      const take = Math.min(item.remaining, left)
      item.remaining = round2(item.remaining - take)
      left = round2(left - take)
    }
  }
  const buckets: AgingBuckets = { total: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90: 0 }
  for (const item of open) {
    if (item.remaining <= 0.004) continue
    const days = daysBetween(item.date, asOf)
    buckets.total = round2(buckets.total + item.remaining)
    if (days <= 30) buckets.d0_30 = round2(buckets.d0_30 + item.remaining)
    else if (days <= 60) buckets.d31_60 = round2(buckets.d31_60 + item.remaining)
    else if (days <= 90) buckets.d61_90 = round2(buckets.d61_90 + item.remaining)
    else buckets.d90 = round2(buckets.d90 + item.remaining)
  }
  return buckets
}
