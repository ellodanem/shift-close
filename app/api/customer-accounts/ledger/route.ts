import { NextRequest, NextResponse } from 'next/server'
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

// GET /api/customer-accounts/ledger?account=&startDate=&endDate=&opening?
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const account = searchParams.get('account')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const openingParam = searchParams.get('opening')

    if (!account?.trim() || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'account, startDate, and endDate are required' },
        { status: 400 }
      )
    }

    const openingOverride =
      openingParam != null && openingParam !== ''
        ? Number(openingParam)
        : null

    const view = await fetchAccountLedgerView({
      account: account.trim(),
      startDate,
      endDate,
      openingOverride:
        openingOverride != null && !Number.isNaN(openingOverride)
          ? openingOverride
          : null
    })

    return NextResponse.json(view)
  } catch (error) {
    console.error('Error fetching customer ledger:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ledger' },
      { status: 500 }
    )
  }
}

// POST /api/customer-accounts/ledger
// Body A — single line: { account, date, lineType, amount, memo?, paymentMethod?, ref? }
// Body B — Cstore import: { account, year, month, opening, entries[], replaceImported?: true }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body?.importType === 'cstore' || Array.isArray(body?.entries)) {
      return handleCstoreImport(body)
    }

    const { account, date, lineType, amount, memo, paymentMethod, ref } = body || {}

    if (!account?.trim() || !date?.trim()) {
      return NextResponse.json(
        { error: 'account and date are required' },
        { status: 400 }
      )
    }
    if (lineType !== 'charge' && lineType !== 'payment') {
      return NextResponse.json(
        { error: 'lineType must be charge or payment' },
        { status: 400 }
      )
    }
    const amt = Number(amount)
    if (Number.isNaN(amt) || amt <= 0) {
      return NextResponse.json(
        { error: 'amount must be a positive number' },
        { status: 400 }
      )
    }

    const maxOrder = await prisma.customerArLedgerLine.aggregate({
      where: {
        account: { equals: account.trim(), mode: 'insensitive' },
        date: date.trim()
      },
      _max: { sortOrder: true }
    })

    const line = await prisma.customerArLedgerLine.create({
      data: {
        account: account.trim(),
        date: date.trim(),
        lineType,
        amount: roundMoney(amt),
        memo: typeof memo === 'string' ? memo.trim() || null : null,
        paymentMethod:
          typeof paymentMethod === 'string' && paymentMethod.trim()
            ? paymentMethod.trim()
            : null,
        ref: typeof ref === 'string' ? ref.trim() || null : null,
        source: 'manual',
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1
      }
    })

    return NextResponse.json(line, { status: 201 })
  } catch (error) {
    console.error('Error creating ledger line:', error)
    return NextResponse.json(
      { error: 'Failed to create ledger line' },
      { status: 500 }
    )
  }
}

async function handleCstoreImport(body: {
  account?: string
  year?: number
  month?: number
  opening?: number
  entries?: Array<{
    date: string
    lineType: 'charge' | 'payment'
    amount: number
    memo?: string
    sortOrder?: number
  }>
  html?: string
  updateSnapshot?: boolean
}) {
  const account = body.account?.trim()
  const year = Number(body.year)
  const month = Number(body.month)

  if (!account || Number.isNaN(year) || Number.isNaN(month)) {
    return NextResponse.json(
      { error: 'account, year, and month are required for import' },
      { status: 400 }
    )
  }

  let opening = Number(body.opening ?? 0)
  let entries = body.entries

  if (body.html && typeof body.html === 'string') {
    const parsed = parseCustomerCreditReportHtml(body.html)
    opening = parsed.opening
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
  }

  if (!entries?.length) {
    return NextResponse.json(
      { error: 'No ledger entries to import' },
      { status: 400 }
    )
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

  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const view = await fetchAccountLedgerView({
    account,
    startDate: start,
    endDate: end,
    openingOverride: opening
  })

  return NextResponse.json(
    { imported: entries.length, opening, view },
    { status: 201 }
  )
}
