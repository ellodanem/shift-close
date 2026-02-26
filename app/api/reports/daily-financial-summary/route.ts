import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Fetch all shifts (or filtered by date range)
    const shifts = await prisma.shiftClose.findMany({
      where: {
        ...(startDate && endDate
          ? {
              date: {
                gte: startDate,
                lte: endDate
              }
            }
          : {})
      },
      orderBy: { date: 'desc' }
    })

    // Group by date
    const byDate = new Map<string, typeof shifts>()
    shifts.forEach(shift => {
      const date = shift.date
      if (!byDate.has(date)) {
        byDate.set(date, [])
      }
      byDate.get(date)!.push(shift)
    })

    const dailySummaries: Array<{
      date: string
      deposits: number[] // Up to 6 deposits
      totalDeposits: number
      creditTotal: number
      debitTotal: number
      unleaded: number
      diesel: number
      totalRevenue: number
      fleetCardRevenue: number
      massyCoupons: number
      voucherRevenue: number // This might be the same as massyCoupons or a separate calculation
    }> = []

    for (const [date, dayShifts] of byDate.entries()) {
      // Aggregate deposits from all shifts - combine into up to 6 deposits
      const allDeposits: number[] = []
      dayShifts.forEach(shift => {
        try {
          const depositsArray = typeof shift.deposits === 'string'
            ? JSON.parse(shift.deposits || '[]')
            : (Array.isArray(shift.deposits) ? shift.deposits : [])
          
          // Filter out NaN, null, undefined, and 0 values, then add to allDeposits
          depositsArray.forEach((d: any) => {
            if (d !== null && d !== undefined && !Number.isNaN(d) && d > 0) {
              allDeposits.push(Number(d))
            }
          })
        } catch {
          // Skip invalid JSON
        }
      })

      // Sort deposits descending and take first 6
      const sortedDeposits = allDeposits.sort((a, b) => b - a).slice(0, 6)
      // Pad to 6 with zeros
      const deposits = [...sortedDeposits, ...Array(6 - sortedDeposits.length).fill(0)]

      // Calculate totals
      const totalDeposits = allDeposits.reduce((sum, d) => sum + d, 0)
      const creditTotal = dayShifts.reduce((sum, s) => sum + s.otherCredit, 0)
      const debitTotal = dayShifts.reduce((sum, s) => sum + s.systemDebit, 0)
      const unleaded = dayShifts.reduce((sum, s) => sum + s.unleaded, 0)
      const diesel = dayShifts.reduce((sum, s) => sum + s.diesel, 0)
      const fleetCardRevenue = dayShifts.reduce((sum, s) => sum + s.systemFleet, 0)
      const massyCoupons = dayShifts.reduce((sum, s) => sum + s.systemMassyCoupons, 0)

      // Total Revenue = Total Deposits + Credit Total + Debit Total + Unleaded + Diesel
      const totalRevenue = totalDeposits + creditTotal + debitTotal + unleaded + diesel

      // Voucher Revenue - based on the spreadsheet, this appears to be related to Massy Coupons
      // For now, we'll use Massy Coupons as Voucher Revenue, but this might need adjustment
      const voucherRevenue = massyCoupons

      dailySummaries.push({
        date,
        deposits,
        totalDeposits,
        creditTotal,
        debitTotal,
        unleaded,
        diesel,
        totalRevenue,
        fleetCardRevenue,
        massyCoupons,
        voucherRevenue
      })
    }

    // Sort by date ascending (oldest first)
    dailySummaries.sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json(dailySummaries)
  } catch (error) {
    console.error('Error fetching daily financial summary:', error)
    return NextResponse.json({ error: 'Failed to fetch daily financial summary' }, { status: 500 })
  }
}

