import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import { importCstoreCreditReport } from '@/lib/customer-ar-cstore-import'
import { fetchAccountLedgerView } from '@/lib/customer-ar-ledger'

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

    if (body?.importType === 'cstore' || Array.isArray(body?.entries) || body?.html) {
      const result = await importCstoreCreditReport(body)
      if ('error' in result && result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      return NextResponse.json(
        { imported: result.imported, opening: result.opening, view: result.view, empty: result.empty },
        { status: result.status }
      )
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
