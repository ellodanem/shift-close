import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  computeLedgerWithRunning,
  type LedgerRowWithRunning
} from '@/lib/parse-customer-credit-report'

export async function getLedgerOpeningForAccount(
  account: string,
  year: number,
  month: number
): Promise<number> {
  const snap = await prisma.customerArAccountSnapshot.findFirst({
    where: { year, month, account: { equals: account, mode: 'insensitive' } }
  })
  if (snap) return roundMoney(snap.opening)

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prev = await prisma.customerArAccountSnapshot.findFirst({
    where: {
      year: prevYear,
      month: prevMonth,
      account: { equals: account, mode: 'insensitive' }
    }
  })
  if (prev) return roundMoney(prev.closing)

  return 0
}

export async function fetchAccountLedgerView(params: {
  account: string
  startDate: string
  endDate: string
  openingOverride?: number | null
}): Promise<{
  account: string
  opening: number
  rows: LedgerRowWithRunning[]
  totals: { charges: number; payments: number; closing: number }
}> {
  const account = params.account.trim()
  const lines = await prisma.customerArLedgerLine.findMany({
    where: {
      account: { equals: account, mode: 'insensitive' },
      date: { gte: params.startDate, lte: params.endDate }
    },
    orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }]
  })

  const [y, m] = params.startDate.split('-').map(Number)
  let opening =
    params.openingOverride != null && !Number.isNaN(params.openingOverride)
      ? roundMoney(params.openingOverride)
      : await getLedgerOpeningForAccount(account, y, m)

  const rows = computeLedgerWithRunning(opening, lines)
  const totals = {
    charges: roundMoney(rows.reduce((s, r) => s + r.charges, 0)),
    payments: roundMoney(rows.reduce((s, r) => s + r.payments, 0)),
    closing: rows.length > 0 ? rows[rows.length - 1].runningTotal : opening
  }

  return { account, opening, rows, totals }
}

export async function syncPaymentToLedger(payment: {
  id: string
  date: string
  account: string
  amount: number
  paymentMethod: string | null
  ref: string | null
  notes: string | null
}) {
  await prisma.customerArLedgerLine.upsert({
    where: { paymentId: payment.id },
    create: {
      account: payment.account,
      date: payment.date,
      lineType: 'payment',
      amount: roundMoney(payment.amount),
      paymentMethod: payment.paymentMethod,
      ref: payment.ref,
      memo: payment.notes || null,
      source: 'payment_record',
      paymentId: payment.id
    },
    update: {
      account: payment.account,
      date: payment.date,
      amount: roundMoney(payment.amount),
      paymentMethod: payment.paymentMethod,
      ref: payment.ref,
      memo: payment.notes || null
    }
  })
}

export async function upsertAccountSnapshotFromLedgerSummary(
  account: string,
  year: number,
  month: number,
  opening: number,
  charges: number,
  payments: number,
  closing: number
) {
  const acc = account.trim()
  const existing = await prisma.customerArAccountSnapshot.findFirst({
    where: { year, month, account: { equals: acc, mode: 'insensitive' } }
  })

  const data = {
    opening: roundMoney(opening),
    charges: roundMoney(charges),
    payments: roundMoney(payments),
    closing: roundMoney(closing)
  }

  if (existing) {
    await prisma.customerArAccountSnapshot.update({
      where: { id: existing.id },
      data
    })
  } else {
    await prisma.customerArAccountSnapshot.create({
      data: { year, month, account: acc, ...data }
    })
  }
}
