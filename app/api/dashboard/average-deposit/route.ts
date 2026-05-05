import { NextResponse } from 'next/server'
import { businessTodayYmd, toYmdInBusinessTz, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function sumDepositsFromShifts(shifts: { deposits: unknown }[]): number {
  let total = 0
  shifts.forEach((shift) => {
    try {
      const depositsArray =
        typeof shift.deposits === 'string'
          ? JSON.parse(shift.deposits || '[]')
          : Array.isArray(shift.deposits)
            ? shift.deposits
            : []
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

/** MTD through latest shift-close date in the month; average ÷ that day-of-month. Comparisons use same calendar day as last close. */
export async function GET() {
  try {
    const todayStr = businessTodayYmd()
    const today = ymdToUtcNoonDate(todayStr)
    const year = Number(todayStr.slice(0, 4))
    const month = Number(todayStr.slice(5, 7))
    const firstStr = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDayOfMonth = new Date(year, month, 0).getDate()
    const lastOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`
    const mtdEndCap = todayStr < lastOfMonthStr ? todayStr : lastOfMonthStr

    const lastShiftAgg = await prisma.shiftClose.aggregate({
      where: {
        date: { gte: firstStr, lte: mtdEndCap }
      },
      _max: { date: true }
    })

    const lastShiftDate = lastShiftAgg._max.date
    if (!lastShiftDate) {
      return NextResponse.json({
        avgDepositMTD: 0,
        totalDepositsMTD: 0,
        daysElapsed: 0,
        lastShiftDate: null,
        periodLabel: 'No shift closes recorded this month yet.',
        sameDayLastMonth: null,
        sameDayLastYear: null
      })
    }

    const mtdShifts = await prisma.shiftClose.findMany({
      where: {
        date: { gte: firstStr, lte: lastShiftDate }
      }
    })

    const totalDepositsMTD = sumDepositsFromShifts(mtdShifts)
    const anchorDay = Number(lastShiftDate.slice(8, 10))
    const daysElapsed = anchorDay
    const avgDepositMTD = daysElapsed > 0 ? totalDepositsMTD / daysElapsed : 0

    const sameDayLastMonth = new Date(Date.UTC(year, month - 2, anchorDay, 12, 0, 0, 0))
    const sameDayLastMonthStr = toYmdInBusinessTz(sameDayLastMonth)
    const sameDayLastYear = new Date(Date.UTC(year - 1, month - 1, anchorDay, 12, 0, 0, 0))
    const sameDayLastYearStr = toYmdInBusinessTz(sameDayLastYear)

    const [lastMonthShifts, lastYearShifts] = await Promise.all([
      prisma.shiftClose.findMany({
        where: { date: sameDayLastMonthStr }
      }),
      prisma.shiftClose.findMany({
        where: { date: sameDayLastYearStr }
      })
    ])

    const sameDayLastMonthTotal =
      lastMonthShifts.length > 0 ? sumDepositsFromShifts(lastMonthShifts) : null
    const sameDayLastYearTotal =
      lastYearShifts.length > 0 ? sumDepositsFromShifts(lastYearShifts) : null

    const periodLabel = `Through ${lastShiftDate} (last shift close). Average = MTD total ÷ ${daysElapsed} (day of month).`

    return NextResponse.json({
      avgDepositMTD,
      totalDepositsMTD,
      daysElapsed,
      lastShiftDate,
      periodLabel,
      sameDayLastMonth:
        sameDayLastMonthTotal != null
          ? { date: sameDayLastMonthStr, total: sameDayLastMonthTotal }
          : null,
      sameDayLastYear:
        sameDayLastYearTotal != null
          ? { date: sameDayLastYearStr, total: sameDayLastYearTotal }
          : null
    })
  } catch (error) {
    console.error('Error fetching average deposit:', error)
    return NextResponse.json({ error: 'Failed to fetch average deposit' }, { status: 500 })
  }
}
