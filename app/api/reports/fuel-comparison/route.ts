import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { litresToGallons } from '@/lib/fuel-constants'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')

    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear()
    const month = monthParam ? parseInt(monthParam) : new Date().getMonth() + 1
    const prevYear = year - 1

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
    }

    const daysInMonth = new Date(year, month, 0).getDate()
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    const prevStartDate = `${prevYear}-${String(month).padStart(2, '0')}-01`
    const prevEndDate = `${prevYear}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // Current year: HistoricalFuelData first (allows manual override), else ShiftClose
    // Previous year: HistoricalFuelData first, else ShiftClose
    const [curHistorical, prevHistorical, currentShifts, prevShifts] = await Promise.all([
      prisma.historicalFuelData.findMany({
        where: { year, month }
      }),
      prisma.historicalFuelData.findMany({
        where: { year: prevYear, month }
      }),
      prisma.shiftClose.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        select: { date: true, unleaded: true, diesel: true }
      }),
      prisma.shiftClose.findMany({
        where: { date: { gte: prevStartDate, lte: prevEndDate } },
        select: { date: true, unleaded: true, diesel: true }
      })
    ])

    const curHistoricalByDate = new Map(curHistorical.map(r => [r.date, r]))
    const currentByDate = new Map<string, { unleaded: number; diesel: number }>()
    currentShifts.forEach(s => {
      const existing = currentByDate.get(s.date) ?? { unleaded: 0, diesel: 0 }
      currentByDate.set(s.date, {
        unleaded: existing.unleaded + (s.unleaded || 0),
        diesel: existing.diesel + (s.diesel || 0)
      })
    })

    const prevHistoricalByDate = new Map(prevHistorical.map(r => [r.date, r]))
    const prevShiftsByDate = new Map<string, { unleaded: number; diesel: number }>()
    prevShifts.forEach(s => {
      const existing = prevShiftsByDate.get(s.date) ?? { unleaded: 0, diesel: 0 }
      prevShiftsByDate.set(s.date, {
        unleaded: existing.unleaded + (s.unleaded || 0),
        diesel: existing.diesel + (s.diesel || 0)
      })
    })

    const days: Array<{
      date: string
      day: number
      gasLitresCur: number
      gasLitresPrev: number
      dieselLitresCur: number
      dieselLitresPrev: number
      gasGallonsCur: number
      gasGallonsPrev: number
      dieselGallonsCur: number
      dieselGallonsPrev: number
      totalGallonsCur: number
      totalGallonsPrev: number
      variance: number
    }> = []

    let totGasCur = 0
    let totGasPrev = 0
    let totDieselCur = 0
    let totDieselPrev = 0

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const prevDate = `${prevYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      const curHist = curHistoricalByDate.get(date)
      const curShift = currentByDate.get(date) ?? { unleaded: 0, diesel: 0 }
      const hist = prevHistoricalByDate.get(prevDate)
      const prevShift = prevShiftsByDate.get(prevDate) ?? { unleaded: 0, diesel: 0 }

      const gasLitresCur = curHist?.unleadedLitres ?? curShift.unleaded
      const dieselLitresCur = curHist?.dieselLitres ?? curShift.diesel
      const gasLitresPrev = hist?.unleadedLitres ?? prevShift.unleaded
      const dieselLitresPrev = hist?.dieselLitres ?? prevShift.diesel

      const gasGallonsCur = litresToGallons(gasLitresCur)
      const gasGallonsPrev = litresToGallons(gasLitresPrev)
      const dieselGallonsCur = litresToGallons(dieselLitresCur)
      const dieselGallonsPrev = litresToGallons(dieselLitresPrev)
      const totalGallonsCur = gasGallonsCur + dieselGallonsCur
      const totalGallonsPrev = gasGallonsPrev + dieselGallonsPrev
      const variance = totalGallonsCur - totalGallonsPrev

      days.push({
        date,
        day,
        gasLitresCur,
        gasLitresPrev,
        dieselLitresCur,
        dieselLitresPrev,
        gasGallonsCur,
        gasGallonsPrev,
        dieselGallonsCur,
        dieselGallonsPrev,
        totalGallonsCur,
        totalGallonsPrev,
        variance
      })

      totGasCur += gasLitresCur
      totGasPrev += gasLitresPrev
      totDieselCur += dieselLitresCur
      totDieselPrev += dieselLitresPrev
    }

    // Sum daily gallons (rounded) to match spreadsheet totals
    const sumGallonsCur = days.reduce((a, d) => a + d.totalGallonsCur, 0)
    const sumGallonsPrev = days.reduce((a, d) => a + d.totalGallonsPrev, 0)
    const totals = {
      gasLitresCur: totGasCur,
      gasLitresPrev: totGasPrev,
      dieselLitresCur: totDieselCur,
      dieselLitresPrev: totDieselPrev,
      gasGallonsCur: days.reduce((a, d) => a + d.gasGallonsCur, 0),
      gasGallonsPrev: days.reduce((a, d) => a + d.gasGallonsPrev, 0),
      dieselGallonsCur: days.reduce((a, d) => a + d.dieselGallonsCur, 0),
      dieselGallonsPrev: days.reduce((a, d) => a + d.dieselGallonsPrev, 0),
      totalGallonsCur: sumGallonsCur,
      totalGallonsPrev: sumGallonsPrev,
      variance: sumGallonsCur - sumGallonsPrev
    }

    return NextResponse.json({
      year,
      month,
      prevYear,
      days,
      totals
    })
  } catch (error) {
    console.error('Error fetching fuel comparison:', error)
    return NextResponse.json({ error: 'Failed to fetch fuel comparison' }, { status: 500 })
  }
}
