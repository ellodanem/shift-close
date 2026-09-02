import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  creditReportToLedgerEntries,
  parseCustomerCreditReportHtml
} from '@/lib/parse-customer-credit-report'
import {
  fetchAccountLedgerView,
  upsertAccountSnapshotFromLedgerSummary
} from '@/lib/customer-ar-ledger'
import { upsertCustomerArSummaryRow } from '@/lib/customer-ar-summary-upsert'

export type CstoreImportEntry = {
  date: string
  lineType: 'charge' | 'payment'
  amount: number
  memo?: string
  sortOrder?: number
}

export type CstoreImportInput = {
  account: string
  year: number
  month: number
  opening?: number
  entries?: CstoreImportEntry[]
  html?: string
  updateSnapshot?: boolean
  allowEmpty?: boolean
}

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

async function recomputeMonthSummary(year: number, month: number) {
  const allSnaps = await prisma.customerArAccountSnapshot.findMany({
    where: { year, month }
  })
  const aggregates = allSnaps.reduce(
    (acc, r) => {
      acc.opening += r.opening
      acc.charges += r.charges
      acc.payments += r.payments
      acc.closing += r.closing
      return acc
    },
    { opening: 0, charges: 0, payments: 0, closing: 0 }
  )
  await upsertCustomerArSummaryRow({
    year,
    month,
    opening: aggregates.opening,
    charges: aggregates.charges,
    payments: aggregates.payments,
    closing: aggregates.closing
  })
}

export async function importCstoreCreditReport(body: CstoreImportInput) {
  const account = (body.account || '').trim()
  const year = Number(body.year)
  const month = Number(body.month)

  if (!account || Number.isNaN(year) || Number.isNaN(month)) {
    return {
      error: 'account, year, and month are required for import',
      status: 400 as const
    }
  }

  let opening = Number(body.opening ?? 0)
  let entries = body.entries
  let parsedSummary: {
    totalCharges: number
    totalPayments: number
    closing: number
  } | null = null

  if (body.html && typeof body.html === 'string') {
    const parsed = parseCustomerCreditReportHtml(body.html)
    opening = parsed.opening
    parsedSummary = parsed.summary
    entries = creditReportToLedgerEntries(parsed).map((e) => ({
      date: e.date,
      lineType: e.lineType,
      amount: e.amount,
      memo: e.memo,
      sortOrder: e.sortOrder
    }))

    if (body.updateSnapshot !== false) {
      await upsertAccountSnapshotFromLedgerSummary(
        account,
        year,
        month,
        parsed.opening,
        parsed.summary.totalCharges,
        parsed.summary.totalPayments,
        parsed.summary.closing
      )
      await recomputeMonthSummary(year, month)
    }
  }

  const { start, end } = monthRange(year, month)

  if (!entries?.length) {
    if (!body.allowEmpty) {
      return { error: 'No ledger entries to import', status: 400 as const }
    }

    await prisma.customerArLedgerLine.deleteMany({
      where: {
        account: { equals: account, mode: 'insensitive' },
        source: 'cstore_import',
        date: { gte: start, lte: end }
      }
    })

    if (body.updateSnapshot !== false && !body.html && parsedSummary == null) {
      await upsertAccountSnapshotFromLedgerSummary(
        account,
        year,
        month,
        opening,
        0,
        0,
        opening
      )
      await recomputeMonthSummary(year, month)
    }

    const view = await fetchAccountLedgerView({
      account,
      startDate: start,
      endDate: end,
      openingOverride: opening
    })
    return {
      imported: 0,
      empty: true,
      opening,
      view,
      status: 201 as const
    }
  }

  const dates = entries.map((e) => e.date).sort()
  const startDate = dates[0]
  const endDate = dates[dates.length - 1]

  await prisma.customerArLedgerLine.deleteMany({
    where: {
      account: { equals: account, mode: 'insensitive' },
      source: 'cstore_import',
      date: { gte: startDate, lte: endDate }
    }
  })

  await prisma.customerArLedgerLine.createMany({
    data: entries.map((e, i) => ({
      account,
      date: e.date,
      lineType: e.lineType,
      amount: roundMoney(Number(e.amount)),
      memo: e.memo?.trim() || null,
      source: 'cstore_import',
      sortOrder: e.sortOrder ?? i
    }))
  })

  const view = await fetchAccountLedgerView({
    account,
    startDate: start,
    endDate: end,
    openingOverride: opening
  })

  return {
    imported: entries.length,
    empty: false,
    opening,
    view,
    status: 201 as const
  }
}
