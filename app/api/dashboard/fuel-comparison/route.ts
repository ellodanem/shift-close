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

    // Current year: from ShiftClose
    const currentShifts = await prisma.shiftClose.findMany({
      where: { date: { in: dates } },
      select: { date: true, unleaded: true, diesel: true }
    })

    // Prior year: HistoricalFuelData first, else ShiftClose
    const [priorHistorical, priorShifts] = await Promise.all([
      prisma.historicalFuelData.findMany({
        where: { date: { in: priorDates } }
      }),
      prisma.shiftClose.findMany({
        where: { date: { in: priorDates } },
        select: { date: true, unleaded: true, diesel: true }
      })
    ])

    const currentByDate = new Map<string, { unleaded: number; diesel: number }>()
    currentShifts.forEach(s => {
      const existing = currentByDate.get(s.date) ?? { unleaded: 0, diesel: 0 }
      currentByDate.set(s.date, {
        unleaded: existing.unleaded + (s.unleaded || 0),
        diesel: existing.diesel + (s.diesel || 0)
      })
    })

    const priorHistoricalByDate = new Map(priorHistorical.map(r => [r.date, r]))
    const priorShiftsByDate = new Map<string, { unleaded: number; diesel: number }>()
    priorShifts.forEach(s => {
      const existing = priorShiftsByDate.get(s.date) ?? { unleaded: 0, diesel: 0 }
      priorShiftsByDate.set(s.date, {
        unleaded: existing.unleaded + (s.unleaded || 0),
        diesel: existing.diesel + (s.diesel || 0)
      })
    })

    const result = dates.map((date, i) => {
      const current = currentByDate.get(date) ?? { unleaded: 0, diesel: 0 }
      const hist = priorHistoricalByDate.get(priorDates[i])
      const priorShift = priorShiftsByDate.get(priorDates[i]) ?? { unleaded: 0, diesel: 0 }
      const prevUnleaded = hist?.unleadedLitres ?? priorShift.unleaded
      const prevDiesel = hist?.dieselLitres ?? priorShift.diesel
      return {
        date,
        priorDate: priorDates[i],
        unleaded: current.unleaded,
        diesel: current.diesel,
        prevUnleaded,
        prevDiesel
      }
    })

    // Return chronological (oldest → newest) for chart left-to-right
    return NextResponse.json(result.reverse())
  } catch (error) {
    console.error('Error fetching fuel comparison:', error)
    return NextResponse.json({ error: 'Failed to fetch fuel comparison' }, { status: 500 })
  }
}
