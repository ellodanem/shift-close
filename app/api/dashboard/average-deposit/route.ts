import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function sumDepositsFromShifts(shifts: { deposits: unknown }[]): number {
  let total = 0
  shifts.forEach(shift => {
    try {
      const depositsArray = typeof shift.deposits === 'string'
        ? JSON.parse(shift.deposits || '[]')
        : (Array.isArray(shift.deposits) ? shift.deposits : [])
      const shiftTotal = (depositsArray as number[])
        .filter((d: unknown) => d !== null && d !== undefined && !Number.isNaN(Number(d)) && Number(d) > 0)
        .reduce((sum: number, d: unknown) => sum + (Number(d) || 0), 0)
      total += shiftTotal
    } catch {
      // skip invalid
    }
  })
  return total
}

export async function GET() {
  try {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    const dayOfMonth = today.getDate()

    // MTD: 1st of current month through today
    const mtdStart = `${year}-${String(month).padStart(2, '0')}-01`
    const mtdEnd = today.toISOString().slice(0, 10)

    // Same day previous month
    const prevMonth = new Date(year, month - 2, dayOfMonth)
    const sameDayLastMonth = prevMonth.toISOString().slice(0, 10)

    // Same day previous year
    const prevYear = new Date(year - 1, month - 1, dayOfMonth)
    const sameDayLastYear = prevYear.toISOString().slice(0, 10)

    const [mtdShifts, lastMonthShifts, lastYearShifts] = await Promise.all([
      prisma.shiftClose.findMany({
        where: { date: { gte: mtdStart, lte: mtdEnd } }
      }),
      prisma.shiftClose.findMany({
        where: { date: sameDayLastMonth }
      }),
      prisma.shiftClose.findMany({
        where: { date: sameDayLastYear }
      })
    ])

    const totalDepositsMTD = sumDepositsFromShifts(mtdShifts)
    const daysElapsed = dayOfMonth
    const avgDepositMTD = daysElapsed > 0 ? totalDepositsMTD / daysElapsed : 0

    const sameDayLastMonthTotal = lastMonthShifts.length > 0 ? sumDepositsFromShifts(lastMonthShifts) : null
    const sameDayLastYearTotal = lastYearShifts.length > 0 ? sumDepositsFromShifts(lastYearShifts) : null

    return NextResponse.json({
      avgDepositMTD,
      totalDepositsMTD,
      daysElapsed,
      sameDayLastMonth: sameDayLastMonthTotal != null
        ? { date: sameDayLastMonth, total: sameDayLastMonthTotal }
        : null,
      sameDayLastYear: sameDayLastYearTotal != null
        ? { date: sameDayLastYear, total: sameDayLastYearTotal }
        : null
    })
  } catch (error) {
    console.error('Error fetching average deposit:', error)
    return NextResponse.json({ error: 'Failed to fetch average deposit' }, { status: 500 })
  }
}
