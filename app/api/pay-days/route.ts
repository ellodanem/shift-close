/**
 * Pay days API: manage dates when accounting processes payments.
 * GET: list pay days (optional ?date=YYYY-MM-DD to filter by date)
 * POST: create a pay day
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFilter = searchParams.get('date')
    const periodFilter = searchParams.get('period')

    // Current bi-weekly period (15th and 30th): return pay day for 1–15 or 16–end
    if (periodFilter === 'current') {
      const today = new Date()
      const day = today.getDate()
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, '0')
      const lastDay = new Date(year, today.getMonth() + 1, 0).getDate()

      const periodStart = day <= 15
        ? `${year}-${month}-01`
        : `${year}-${month}-16`
      const periodEnd = day <= 15
        ? `${year}-${month}-15`
        : `${year}-${month}-${String(lastDay).padStart(2, '0')}`

      const payDays = await prisma.payDay.findMany({
        where: {
          date: { gte: periodStart, lte: periodEnd }
        },
        orderBy: { date: 'asc' }
      })
      return NextResponse.json(payDays[0] ?? null)
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
