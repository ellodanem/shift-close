import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

/** GET ?year=&month= — MTD total unleaded/diesel from shift closes, divided by calendar days in period (current month: day 1–today; past month: full month). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year'))
    const month = Number(searchParams.get('month'))
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'year and month are required' }, { status: 400 })
    }

    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const firstStr = `${year}-${String(month).padStart(2, '0')}-01`
    const lastOfMonth = new Date(year, month, 0)
    const lastStr = `${year}-${String(month).padStart(2, '0')}-${String(lastOfMonth.getDate()).padStart(2, '0')}`

    if (firstStr > todayStr) {
      return NextResponse.json({
        year,
        month,
        monthName: MONTH_NAMES[month - 1],
        isFutureMonth: true,
        daysInAverage: 0,
        totalUnleaded: 0,
        totalDiesel: 0,
        avgUnleadedPerDay: 0,
        avgDieselPerDay: 0,
        periodLabel: 'Future month'
      })
    }

    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    let endStr: string
    let divisorDays: number

    if (isCurrentMonth) {
      endStr = todayStr
      divisorDays = now.getDate()
    } else {
      endStr = lastStr
      divisorDays = lastOfMonth.getDate()
    }

    const shifts = await prisma.shiftClose.findMany({
      where: {
        date: { gte: firstStr, lte: endStr }
      },
      select: {
        unleaded: true,
        diesel: true
      }
    })

    let totalUnleaded = 0
    let totalDiesel = 0
    for (const s of shifts) {
      totalUnleaded += Number(s.unleaded) || 0
      totalDiesel += Number(s.diesel) || 0
    }

    const avgUnleadedPerDay = divisorDays > 0 ? totalUnleaded / divisorDays : 0
    const avgDieselPerDay = divisorDays > 0 ? totalDiesel / divisorDays : 0

    const periodLabel = isCurrentMonth
      ? `Month-to-date (avg per calendar day through day ${divisorDays})`
      : `Full month (${divisorDays} days)`

    return NextResponse.json({
      year,
      month,
      monthName: MONTH_NAMES[month - 1],
      isFutureMonth: false,
      isCurrentMonth,
      daysInAverage: divisorDays,
      totalUnleaded,
      totalDiesel,
      avgUnleadedPerDay,
      avgDieselPerDay,
      periodLabel
    })
  } catch (e) {
    console.error('fuel-mtd-sold', e)
    return NextResponse.json({ error: 'Failed to load fuel MTD' }, { status: 500 })
  }
}
