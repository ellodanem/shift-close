/**
 * Pay days API: manage dates when accounting processes payments.
 * GET: list pay days (optional ?date=YYYY-MM-DD to filter by date)
 * GET ?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD — optional PayDay in that inclusive range (saved report window).
 * GET ?period=current — current bi-weekly window + optional PayDay row:
 *   { periodStart, periodEnd, payDay: { id, date, notes } | null }
 * POST: create a pay day
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFilter = searchParams.get('date')
    const periodFilter = searchParams.get('period')
    const windowStart = searchParams.get('periodStart')
    const windowEnd = searchParams.get('periodEnd')

    // Arbitrary inclusive YYYY-MM-DD window (e.g. last saved pay period report)
    if (windowStart || windowEnd) {
      if (!windowStart || !windowEnd) {
        return NextResponse.json(
          { error: 'periodStart and periodEnd are required together (YYYY-MM-DD)' },
          { status: 400 }
        )
      }
      const match = /^\d{4}-\d{2}-\d{2}$/
      if (!match.test(windowStart) || !match.test(windowEnd)) {
        return NextResponse.json({ error: 'periodStart and periodEnd must be YYYY-MM-DD' }, { status: 400 })
      }
      const payDays = await prisma.payDay.findMany({
        where: {
          date: { gte: windowStart, lte: windowEnd }
        },
        orderBy: { date: 'asc' }
      })
      const payDay = payDays[0] ?? null
      return NextResponse.json({
        periodStart: windowStart,
        periodEnd: windowEnd,
        payDay
      })
    }

    // Current bi-weekly period (1–15 and 16–end): optional PayDay row + bounds for attendance / UI
    if (periodFilter === 'current') {
      const today = new Date()
      const day = today.getDate()
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, '0')
      const lastDay = new Date(year, today.getMonth() + 1, 0).getDate()

      const periodStart =
        day <= 15 ? `${year}-${month}-01` : `${year}-${month}-16`
      const periodEnd =
        day <= 15
          ? `${year}-${month}-15`
          : `${year}-${month}-${String(lastDay).padStart(2, '0')}`

      const payDays = await prisma.payDay.findMany({
        where: {
          date: { gte: periodStart, lte: periodEnd }
        },
        orderBy: { date: 'asc' }
      })
      const payDay = payDays[0] ?? null
      return NextResponse.json({
        periodStart,
        periodEnd,
        payDay
      })
    }

    const where = dateFilter ? { date: dateFilter } : {}

    const payDays = await prisma.payDay.findMany({
      where,
      orderBy: { date: 'asc' }
    })

    return NextResponse.json(payDays)
  } catch (error) {
    console.error('Pay days GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch pay days' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, notes } = body

    if (!date || typeof date !== 'string') {
      return NextResponse.json({ error: 'Date is required (YYYY-MM-DD)' }, { status: 400 })
    }

    // Validate YYYY-MM-DD
    const match = /^\d{4}-\d{2}-\d{2}$/.exec(date)
    if (!match) {
      return NextResponse.json({ error: 'Date must be in YYYY-MM-DD format' }, { status: 400 })
    }

    const payDay = await prisma.payDay.create({
      data: {
        date,
        notes: notes && typeof notes === 'string' ? notes : undefined
      }
    })

    return NextResponse.json(payDay)
  } catch (error) {
    console.error('Pay days POST error:', error)
    return NextResponse.json({ error: 'Failed to create pay day' }, { status: 500 })
  }
}
