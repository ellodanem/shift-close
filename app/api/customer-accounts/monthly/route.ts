import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET /api/customer-accounts/monthly
// Optional query params:
// - year, month: filter to a specific month
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')

    let summaries

    if (yearParam && monthParam) {
      const year = Number(yearParam)
      const month = Number(monthParam)

      summaries = await prisma.customerArSummary.findMany({
        where: { year, month },
        orderBy: { year: 'desc' }
      })
    } else {
      summaries = await prisma.customerArSummary.findMany({
        orderBy: [
          { year: 'desc' },
          { month: 'desc' }
        ]
      })
    }

    return NextResponse.json(summaries)
  } catch (error) {
    console.error('Error fetching customer A/R summaries:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer A/R summaries' },
      { status: 500 }
    )
  }
}

// POST /api/customer-accounts/monthly
// Body: { year, month, opening, charges, payments, closing?, notes? }
// Upserts a single month row.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      year,
      month,
      opening,
      charges,
      payments,
      closing,
      notes
    } = body || {}

    if (
      typeof year !== 'number' ||
      typeof month !== 'number' ||
      typeof opening !== 'number' ||
      typeof charges !== 'number' ||
      typeof payments !== 'number'
    ) {
      return NextResponse.json(
        { error: 'year, month, opening, charges, and payments are required numbers' },
        { status: 400 }
      )
    }

    const safeClosing =
      typeof closing === 'number' && !Number.isNaN(closing) ? closing : null

    const summary = await prisma.customerArSummary.upsert({
      where: {
        customer_ar_year_month: {
          year,
          month
        }
      },
      update: {
        opening: roundMoney(opening),
        charges: roundMoney(charges),
        payments: roundMoney(payments),
        closing: safeClosing !== null ? roundMoney(safeClosing) : null,
        notes: notes ?? ''
      },
      create: {
        year,
        month,
        opening: roundMoney(opening),
        charges: roundMoney(charges),
        payments: roundMoney(payments),
        closing: safeClosing !== null ? roundMoney(safeClosing) : null,
        notes: notes ?? ''
      }
    })

    return NextResponse.json(summary, { status: 201 })
  } catch (error) {
    console.error('Error saving customer A/R summary:', error)
    return NextResponse.json(
      { error: 'Failed to save customer A/R summary' },
      { status: 500 }
    )
  }
}

