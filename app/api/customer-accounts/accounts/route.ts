import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET /api/customer-accounts/accounts?year=2026&month=1
// Returns all account snapshots for a given month
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year and month query parameters are required' },
        { status: 400 }
      )
    }

    const yearNum = Number(year)
    const monthNum = Number(month)

    if (Number.isNaN(yearNum) || Number.isNaN(monthNum)) {
      return NextResponse.json(
        { error: 'year and month must be numbers' },
        { status: 400 }
      )
    }

    const accounts = await prisma.customerArAccountSnapshot.findMany({
      where: {
        year: yearNum,
        month: monthNum
      },
      orderBy: {
        account: 'asc'
      }
    })

    return NextResponse.json(accounts)
  } catch (error) {
    console.error('Error fetching customer A/R accounts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer accounts' },
      { status: 500 }
    )
  }
}

// POST /api/customer-accounts/accounts
// Body: { year, month, rows: [{ account, opening, charges, payments, closing }] }
// Replaces all account snapshots for that month and recomputes the monthly summary.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { year, month, rows } = body || {}

    if (
      typeof year !== 'number' ||
      typeof month !== 'number' ||
      !Array.isArray(rows)
    ) {
      return NextResponse.json(
        { error: 'year, month, and rows[] are required' },
        { status: 400 }
      )
    }

    // Basic validation and normalization
    const cleanRows = rows
      .filter(
        (r: any) =>
          r &&
          typeof r.account === 'string' &&
          r.account.trim() !== '' &&
          r.account.toLowerCase() !== 'total'
      )
      .map((r: any) => ({
        account: r.account.trim(),
        opening: roundMoney(Number(r.opening || 0)),
        charges: roundMoney(Number(r.charges || 0)),
        payments: roundMoney(Number(r.payments || 0)),
        closing: roundMoney(Number(r.closing || 0))
      }))

    // Replace snapshots for this month
    await prisma.customerArAccountSnapshot.deleteMany({
      where: { year, month }
    })

    if (cleanRows.length > 0) {
      await prisma.customerArAccountSnapshot.createMany({
        data: cleanRows.map((r) => ({
          year,
          month,
          account: r.account,
          opening: r.opening,
          charges: r.charges,
          payments: r.payments,
          closing: r.closing
        }))
      })
    }

    // Recompute monthly summary from snapshots
    const aggregates = cleanRows.reduce(
      (acc, r) => {
        acc.opening += r.opening
        acc.charges += r.charges
        acc.payments += r.payments
        acc.closing += r.closing
        return acc
      },
      { opening: 0, charges: 0, payments: 0, closing: 0 }
    )

    const summary = await prisma.customerArSummary.upsert({
      where: {
        customer_ar_year_month: {
          year,
          month
        }
      },
      update: {
        opening: roundMoney(aggregates.opening),
        charges: roundMoney(aggregates.charges),
        payments: roundMoney(aggregates.payments),
        closing: roundMoney(aggregates.closing)
      },
      create: {
        year,
        month,
        opening: roundMoney(aggregates.opening),
        charges: roundMoney(aggregates.charges),
        payments: roundMoney(aggregates.payments),
        closing: roundMoney(aggregates.closing),
        notes: ''
      }
    })

    return NextResponse.json({ summary }, { status: 201 })
  } catch (error) {
    console.error('Error importing customer A/R accounts:', error)
    return NextResponse.json(
      { error: 'Failed to import customer accounts' },
      { status: 500 }
    )
  }
}
