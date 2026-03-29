import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD or ?year=2026 — St. Lucia public holidays for roster / settings */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const year = searchParams.get('year')

    if (from && to) {
      const list = await prisma.publicHoliday.findMany({
        where: {
          countryCode: 'LC',
          date: { gte: from, lte: to }
        },
        orderBy: { date: 'asc' }
      })
      return NextResponse.json(list)
    }

    if (year) {
      const y = year.replace(/\D/g, '')
      if (y.length !== 4) {
        return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
      }
      const list = await prisma.publicHoliday.findMany({
        where: {
          countryCode: 'LC',
          date: { gte: `${y}-01-01`, lte: `${y}-12-31` }
        },
        orderBy: { date: 'asc' }
      })
      return NextResponse.json(list)
    }

    return NextResponse.json(
      { error: 'Query from+to (week range) or year is required' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error fetching public holidays:', error)
    return NextResponse.json({ error: 'Failed to fetch public holidays' }, { status: 500 })
  }
}
