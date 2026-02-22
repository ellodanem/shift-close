import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Get the last 5 distinct dates that have at least one shift
    const recentDates = await prisma.shiftClose.findMany({
      select: { date: true },
      orderBy: { date: 'desc' },
      distinct: ['date'],
      take: 5
    })

    if (recentDates.length === 0) {
      return NextResponse.json([])
    }

    const dates = recentDates.map(r => r.date)

    // Prior-year dates (same calendar date, 365 days back)
    const priorDates = dates.map(d => {
      const dt = new Date(d + 'T12:00:00')
      dt.setFullYear(dt.getFullYear() - 1)
      return dt.toISOString().slice(0, 10)
    })

    const allDates = [...dates, ...priorDates]

    const shifts = await prisma.shiftClose.findMany({
      where: { date: { in: allDates } },
      select: { date: true, unleaded: true, diesel: true }
    })

    // Sum per date
    const sumByDate = new Map<string, { unleaded: number; diesel: number }>()
    shifts.forEach(s => {
      const existing = sumByDate.get(s.date) ?? { unleaded: 0, diesel: 0 }
      sumByDate.set(s.date, {
        unleaded: existing.unleaded + (s.unleaded || 0),
        diesel: existing.diesel + (s.diesel || 0)
      })
    })

    const result = dates.map((date, i) => {
      const current = sumByDate.get(date) ?? { unleaded: 0, diesel: 0 }
      const prior = sumByDate.get(priorDates[i]) ?? { unleaded: 0, diesel: 0 }
      return {
        date,
        priorDate: priorDates[i],
        unleaded: current.unleaded,
        diesel: current.diesel,
        prevUnleaded: prior.unleaded,
        prevDiesel: prior.diesel
      }
    })

    // Return chronological (oldest → newest) for chart left-to-right
    return NextResponse.json(result.reverse())
  } catch (error) {
    console.error('Error fetching fuel comparison:', error)
    return NextResponse.json({ error: 'Failed to fetch fuel comparison' }, { status: 500 })
  }
}
