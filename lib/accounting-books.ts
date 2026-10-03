import { prisma } from '@/lib/prisma'
import { businessTodayYmd, toYmdInBusinessTz } from '@/lib/datetime-policy'
import { buildComparisonRowsFromShifts } from '@/lib/deposit-comparison-rows'
import { roundMoney } from '@/lib/fuelPayments'
import { listUncashedChecks } from '@/lib/uncashedChecks'
import { type AccountingBooks, type VendorRow } from '@/lib/accounting-types'
import { cashbookAccountLabel } from '@/lib/overhead-categories'
import { buildReceivableAging } from '@/lib/receivable-aging'

export function parseAccountingMonth(month: string): { start: string; end: string; year: number; monthNum: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim())
  if (!match) return null
  const year = Number(match[1])
  const monthNum = Number(match[2])
  if (!year || monthNum < 1 || monthNum > 12) return null
  const last = new Date(year, monthNum, 0).getDate()
  const mm = String(monthNum).padStart(2, '0')
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(last).padStart(2, '0')}`,
    year,
    monthNum
  }
}

function fuelAccount(type: string): string {
  if (type === 'Fuel') return '3022 · Rec. Gas'
  if (type === 'Rent') return 'Mtnce'
  return '3021 · Rec. Gen'
}

function paidVendorAccount(
  invoices: Array<{ vendorInvoice: { category: { name: string; code: string | null } | null } | null }>
): string {
  const labels = [
    ...new Set(invoices.map((invoice) => cashbookAccountLabel(invoice.vendorInvoice?.category ?? null)))
  ]
  return labels.join(', ') || '3021 · Rec. Gen'
}

function ymdInRange(ymd: string, start: string, end: string): boolean {
  return ymd >= start && ymd <= end
}

function sourceOf(entry: {
  shiftId: string | null
  depositLineIndex: number | null
  shiftIncomeKind: string | null
  customerArPaymentId: string | null
  paymentBatchId: string | null
  vendorPaymentBatchId: string | null
}): { source: string; fromShift: boolean } {
  if (entry.shiftId && entry.depositLineIndex != null) return { source: 'Shift deposit', fromShift: true }
  if (entry.shiftIncomeKind === 'credit') return { source: 'Shift credit card', fromShift: true }
  if (entry.shiftIncomeKind === 'debit') return { source: 'Shift debit card', fromShift: true }
  if (entry.customerArPaymentId) return { source: 'Customer payment', fromShift: false }
  if (entry.paymentBatchId) return { source: 'Fuel payment', fromShift: false }
  if (entry.vendorPaymentBatchId) return { source: 'Vendor payment', fromShift: false }
  return { source: 'Entered here', fromShift: false }
}

export async function buildAccountingBooks(month: string): Promise<AccountingBooks | null> {
  const range = parseAccountingMonth(month)
  if (!range) return null
  const { start, end, year, monthNum } = range
  const asOf = businessTodayYmd()
  const rangeStart = new Date(`${start}T00:00:00.000Z`)
  const rangeEnd = new Date(`${end}T23:59:59.999Z`)

  const [
    balance,
    entries,
    snapshots,
    ledgerLines,
    payments,
    fuelOpen,
    vendorOpen,
    fuelPaid,
    vendorPaid,
    vendors,
    shifts,
    uncashed,
    payRuns,
    payableRuns
  ] = await Promise.all([
    prisma.balance.findUnique({ where: { id: 'balance' } }),
    prisma.cashbookEntry.findMany({
      where: { date: { gte: start, lte: end } },
      include: { allocations: { include: { category: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.customerArAccountSnapshot.findMany({ where: { year, month: monthNum } }),
    prisma.customerArLedgerLine.findMany({
      where: { date: { lte: end } },
      select: { account: true, date: true, lineType: true, amount: true }
    }),
    prisma.customerArPayment.findMany({
      where: { date: { lte: end } },
      select: { account: true, date: true }
    }),
    prisma.invoice.findMany({
      where: { status: { in: ['pending', 'simulated'] } },
      orderBy: { invoiceDate: 'asc' }
    }),
    prisma.vendorInvoice.findMany({
      where: { status: 'pending' },
      include: { vendor: true, category: true },
      orderBy: { invoiceDate: 'asc' }
    }),
    prisma.paymentBatch.findMany({
      where: { paymentDate: { gte: rangeStart, lte: rangeEnd } },
      include: { invoices: true },
      orderBy: { paymentDate: 'asc' }
    }),
    prisma.vendorPaymentBatch.findMany({
      where: { paymentDate: { gte: rangeStart, lte: rangeEnd } },
      include: {
        vendor: true,
        invoices: { include: { vendorInvoice: { include: { category: true } } } }
      },
      orderBy: { paymentDate: 'asc' }
    }),
    prisma.vendor.findMany({
      include: {
        invoices: { where: { status: 'pending' } },
        batches: { orderBy: { paymentDate: 'desc' }, take: 1 }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.shiftClose.findMany({
      where: { date: { gte: start, lte: end }, status: { in: ['closed', 'reviewed'] } },
      include: { depositRecords: true },
      orderBy: { date: 'asc' }
    }),
    listUncashedChecks(),
    prisma.payRun.findMany({
      where: { status: { not: 'void' }, startDate: { lte: end }, endDate: { gte: start } },
      include: { lines: { select: { netPay: true, grossPay: true } } },
      orderBy: { payDate: 'asc' }
    }),
    prisma.payRun.findMany({
      where: { status: 'processed', payDate: { gt: asOf } },
      include: { lines: { select: { netPay: true } } }
    })
  ])

  let running = 0
  let monthIncome = 0
  let monthExpense = 0
  const categoryTotals = new Map<string, { name: string; type: string; amount: number }>()
  const ledger = entries.map((entry) => {
    const moneyIn = roundMoney(entry.creditAmt || 0)
    const moneyOut = roundMoney(
      (entry.debitCash || 0) + (entry.debitCheck || 0) + (entry.debitEcard || 0) + (entry.debitDcard || 0)
    )
    running = roundMoney(running + moneyIn - moneyOut)
    const category = entry.allocations[0]?.category
    const categoryName = category?.name ?? '—'
    const categoryType = category?.type || (moneyIn > 0 ? 'income' : 'expense')
    for (const alloc of entry.allocations) {
      const type = alloc.category.type || 'expense'
      const key = `${type}:${alloc.category.name}`
      const prev = categoryTotals.get(key)
      categoryTotals.set(key, {
        name: alloc.category.name,
        type,
        amount: roundMoney((prev?.amount ?? 0) + alloc.amount)
      })
      if (type === 'income') monthIncome = roundMoney(monthIncome + alloc.amount)
      else if (type === 'expense') monthExpense = roundMoney(monthExpense + alloc.amount)
    }
    const tagged = sourceOf(entry)
    return {
      date: entry.date,
      description: entry.description,
      category: categoryName,
      debit: moneyIn,
      credit: moneyOut,
      balance: running,
      source: tagged.source,
      fromShift: tagged.fromShift,
      categoryType
    }
  })

  const linesByAccount = new Map<string, Array<{ date: string; lineType: string; amount: number }>>()
  for (const line of ledgerLines) {
    const name = line.account.trim()
    if (!name) continue
    const list = linesByAccount.get(name) ?? []
    list.push({ date: line.date, lineType: line.lineType, amount: line.amount })
    linesByAccount.set(name, list)
  }
  const lastPay = new Map<string, string>()
  for (const payment of payments) {
    const name = payment.account.trim()
    if (!name) continue
    const prev = lastPay.get(name)
    if (!prev || payment.date > prev) lastPay.set(name, payment.date)
  }
  for (const [name, lines] of linesByAccount) {
    for (const line of lines) {
      if (line.lineType !== 'payment') continue
      const prev = lastPay.get(name)
      if (!prev || line.date > prev) lastPay.set(name, line.date)
    }
  }

  const receivable = buildReceivableAging({
    end,
    snapshots,
    lines: ledgerLines,
    lastPaymentByAccount: lastPay
  })
  const customers = receivable.customers
  const aging = receivable.aging
  const accountsReceivable = receivable.accountsReceivable

  const openBills = [
    ...fuelOpen.map((invoice) => ({
      id: invoice.id,
      kind: 'fuel' as const,
      vendorId: null,
      name: invoice.type || 'Fuel',
      number: invoice.invoiceNumber,
      date: toYmdInBusinessTz(invoice.invoiceDate),
      due: invoice.dueDate ? toYmdInBusinessTz(invoice.dueDate) : null,
      amount: roundMoney(invoice.amount),
      account: fuelAccount(invoice.type),
      status: invoice.status
    })),
    ...vendorOpen.map((invoice) => ({
      id: invoice.id,
      kind: invoice.categoryId ? ('overhead' as const) : ('vendor' as const),
      vendorId: invoice.vendorId,
      name: invoice.vendor.name,
      number: invoice.invoiceNumber,
      date: toYmdInBusinessTz(invoice.invoiceDate),
      due: invoice.dueDate ? toYmdInBusinessTz(invoice.dueDate) : null,
      amount: roundMoney(invoice.amount + (invoice.vat ?? 0)),
      account: cashbookAccountLabel(invoice.category),
      status: invoice.status
    }))
  ].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))

  const paidBills = [
    ...fuelPaid
      .filter((batch) => ymdInRange(toYmdInBusinessTz(batch.paymentDate), start, end))
      .map((batch) => ({
        date: toYmdInBusinessTz(batch.paymentDate),
        name: batch.invoices[0]?.type || 'Fuel',
        ref: batch.bankRef,
        amount: roundMoney(batch.totalAmount),
        account: fuelAccount(batch.invoices[0]?.type || 'Fuel')
      })),
    ...vendorPaid
      .filter((batch) => ymdInRange(toYmdInBusinessTz(batch.paymentDate), start, end))
      .map((batch) => ({
        date: toYmdInBusinessTz(batch.paymentDate),
        name: batch.vendor.name,
        ref: batch.bankRef,
        amount: roundMoney(batch.totalAmount),
        account: paidVendorAccount(batch.invoices)
      }))
  ].sort((a, b) => a.date.localeCompare(b.date))

  const fuelOpenTotal = roundMoney(fuelOpen.reduce((sum, invoice) => sum + invoice.amount, 0))
  const lastFuel = await prisma.paymentBatch.findFirst({ orderBy: { paymentDate: 'desc' } })
  const vendorRows: VendorRow[] = vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    openAmount: roundMoney(vendor.invoices.reduce((sum, invoice) => sum + invoice.amount + (invoice.vat ?? 0), 0)),
    lastPayment: vendor.batches[0] ? toYmdInBusinessTz(vendor.batches[0].paymentDate) : null
  }))
  if (fuelOpenTotal > 0 || lastFuel) {
    vendorRows.unshift({
      id: null,
      name: 'Fuel',
      openAmount: fuelOpenTotal,
      lastPayment: lastFuel ? toYmdInBusinessTz(lastFuel.paymentDate) : null
    })
  }

  const comparison = buildComparisonRowsFromShifts(shifts)
  const reconcile = comparison
    .filter((row) => row.amount > 0)
    .map((row) => ({
      shiftId: row.shiftId,
      date: row.date,
      description: row.recordKind === 'deposit' ? `Deposit · ${row.shift}` : `Card · ${row.shift}`,
      recordKind: row.recordKind,
      lineIndex: row.lineIndex,
      amount: roundMoney(row.amount),
      bankStatus: row.bankStatus,
      shift: row.shift
    }))

  const receipts = comparison.flatMap((row) => {
    const files = [
      ...row.scanUrls.map((url) => ({ href: url, label: row.recordKind === 'deposit' ? 'Deposit slip' : 'Card slip' })),
      ...(row.securitySlipUrl ? [{ href: row.securitySlipUrl, label: 'Security slip' }] : [])
    ]
    if (files.length === 0) return []
    return files.map((file) => ({
      date: row.date,
      label: file.label,
      href: file.href,
      linked: row.shift
    }))
  })

  const payRunRows = payRuns.map((run) => ({
    id: run.id,
    period: `${run.startDate} – ${run.endDate}`,
    payDate: run.payDate,
    status: run.status === 'processed' ? 'Approved' : 'Draft',
    net: roundMoney(run.lines.reduce((sum, line) => sum + (line.netPay || 0), 0)),
    gross: roundMoney(run.lines.reduce((sum, line) => sum + (line.grossPay || 0), 0))
  }))

  return {
    month,
    startDate: start,
    endDate: end,
    asOf,
    westlineOnFile: roundMoney(balance?.currentBalance ?? 0),
    serviceStationOnFile: roundMoney(balance?.totalAutoCurrentBalance ?? 0),
    accountsReceivable,
    accountsPayableFuel: fuelOpenTotal,
    accountsPayableVendors: roundMoney(vendorOpen.reduce((sum, invoice) => sum + invoice.amount, 0)),
    payrollPayable: roundMoney(
      payableRuns.reduce(
        (sum, run) => sum + run.lines.reduce((lineSum, line) => lineSum + (line.netPay || 0), 0),
        0
      )
    ),
    monthIncome,
    monthExpense,
    monthNet: roundMoney(monthIncome - monthExpense),
    ledger: ledger.map(({ categoryType: _categoryType, ...row }) => row),
    categories: [...categoryTotals.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    customers,
    aging,
    openBills,
    paidBills,
    vendors: vendorRows.filter((row) => row.openAmount > 0 || row.lastPayment),
    reconcile,
    uncashedChecks: uncashed.map((check) => ({
      date: check.paymentDate,
      payee: check.payee,
      ref: check.bankRef,
      amount: check.totalAmount
    })),
    receipts,
    payRuns: payRunRows
  }
}
