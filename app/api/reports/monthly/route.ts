import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    // Default to current month if not specified
    const now = new Date()
    const targetYear = year ? parseInt(year) : now.getFullYear()
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1

    // Calculate date range for the month
    const monthStart = new Date(targetYear, targetMonth - 1, 1)
    const monthEnd = new Date(targetYear, targetMonth, 0)
    const startDate = monthStart.toISOString().split('T')[0]
    const endDate = monthEnd.toISOString().split('T')[0]

    // Fetch all shifts for the month
    const shifts = await prisma.shiftClose.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        corrections: true
      }
    })

    // Calculate total days and working days
    const totalDays = monthEnd.getDate()
    const workingDays = shifts.length > 0 ? new Set(shifts.map(s => s.date)).size : 0

    // Aggregate financial totals
    let totalDeposits = 0
    let totalDebit = 0
    let totalCredit = 0
    let totalFleet = 0
    let totalVouchers = 0
    let totalUnleaded = 0
    let totalDiesel = 0
    let totalOverShort = 0
    let shiftsWithOverShort = 0
    let shiftsWithZeroOverShort = 0
    let largestOver = 0
    let largestShort = 0

    // Supervisor performance tracking
    const supervisorStats = new Map<string, {
      shifts: number
      totalRevenue: number
      totalOverShort: number
      shiftsWithDiscrepancy: number
    }>()

    shifts.forEach(shift => {
      // Calculate deposits
      try {
        const depositsArray = typeof shift.deposits === 'string'
          ? JSON.parse(shift.deposits || '[]')
          : (Array.isArray(shift.deposits) ? shift.deposits : [])
        
        const shiftDeposits = depositsArray
          .filter((d: any) => d !== null && d !== undefined && !Number.isNaN(d) && d > 0)
          .reduce((sum: number, d: number) => sum + (Number(d) || 0), 0)
        
        totalDeposits += shiftDeposits
      } catch {
        // Skip invalid deposits
      }

      // Financial totals
      totalDebit += shift.systemDebit || 0
      totalCredit += shift.otherCredit || 0
      totalFleet += shift.systemFleet || 0
      totalVouchers += shift.systemMassyCoupons || 0
      totalUnleaded += shift.unleaded || 0
      totalDiesel += shift.diesel || 0

      // Over/Short analysis
      const overShort = shift.overShortTotal || 0
      totalOverShort += overShort
      
      if (overShort !== 0) {
        shiftsWithOverShort++
        if (overShort > largestOver) largestOver = overShort
        if (overShort < largestShort) largestShort = overShort
      } else {
        shiftsWithZeroOverShort++
      }

      // Supervisor performance
      const supervisor = shift.supervisor
      if (!supervisorStats.has(supervisor)) {
        supervisorStats.set(supervisor, {
          shifts: 0,
          totalRevenue: 0,
          totalOverShort: 0,
          shiftsWithDiscrepancy: 0
        })
      }
      const stats = supervisorStats.get(supervisor)!
      stats.shifts++
      
      // Calculate shift revenue
      try {
        const depositsArray = typeof shift.deposits === 'string'
          ? JSON.parse(shift.deposits || '[]')
          : (Array.isArray(shift.deposits) ? shift.deposits : [])
        const shiftDeposits = depositsArray
          .filter((d: any) => d !== null && d !== undefined && !Number.isNaN(d) && d > 0)
          .reduce((sum: number, d: number) => sum + (Number(d) || 0), 0)
        
        const shiftRevenue = shiftDeposits + (shift.otherCredit || 0) + (shift.systemDebit || 0) + 
                            (shift.unleaded || 0) + (shift.diesel || 0)
        stats.totalRevenue += shiftRevenue
      } catch {}
      
      stats.totalOverShort += overShort
      if (overShort !== 0) {
        stats.shiftsWithDiscrepancy++
      }
    })

    const totalDebitAndCredit = totalDebit + totalCredit
    const grandTotal = totalDeposits + totalDebitAndCredit + totalFleet + totalVouchers
    const averageOverShort = shifts.length > 0 ? totalOverShort / shifts.length : 0

    // Get daily breakdown (reuse daily financial summary logic)
    const byDate = new Map<string, typeof shifts>()
    shifts.forEach(shift => {
      if (!byDate.has(shift.date)) {
        byDate.set(shift.date, [])
      }
      byDate.get(shift.date)!.push(shift)
    })

    const dailyBreakdown: Array<{
      date: string
      deposits: number[]
      totalDeposits: number
      creditTotal: number
      debitTotal: number
      unleaded: number
      diesel: number
      totalRevenue: number
      fleetCardRevenue: number
      massyCoupons: number
      voucherRevenue: number
      overShortTotal: number
    }> = []

    for (const [date, dayShifts] of byDate.entries()) {
      // Aggregate deposits
      const allDeposits: number[] = []
      dayShifts.forEach(shift => {
        try {
          const depositsArray = typeof shift.deposits === 'string'
            ? JSON.parse(shift.deposits || '[]')
            : (Array.isArray(shift.deposits) ? shift.deposits : [])
          
          depositsArray.forEach((d: any) => {
            if (d !== null && d !== undefined && !Number.isNaN(d) && d > 0) {
              allDeposits.push(Number(d))
            }
          })
        } catch {}
      })

      const sortedDeposits = allDeposits.sort((a, b) => b - a).slice(0, 6)
      const deposits = [...sortedDeposits, ...Array(6 - sortedDeposits.length).fill(0)]

      const totalDepositsDay = allDeposits.reduce((sum, d) => sum + d, 0)
      const creditTotal = dayShifts.reduce((sum, s) => sum + s.otherCredit, 0)
      const debitTotal = dayShifts.reduce((sum, s) => sum + s.systemDebit, 0)
      const unleaded = dayShifts.reduce((sum, s) => sum + s.unleaded, 0)
      const diesel = dayShifts.reduce((sum, s) => sum + s.diesel, 0)
      const fleetCardRevenue = dayShifts.reduce((sum, s) => sum + s.systemFleet, 0)
      const massyCoupons = dayShifts.reduce((sum, s) => sum + s.systemMassyCoupons, 0)
      const overShortTotal = dayShifts.reduce((sum, s) => sum + (s.overShortTotal || 0), 0)

      const totalRevenue = totalDepositsDay + creditTotal + debitTotal + unleaded + diesel
      const voucherRevenue = massyCoupons

      dailyBreakdown.push({
        date,
        deposits,
        totalDeposits: totalDepositsDay,
        creditTotal,
        debitTotal,
        unleaded,
        diesel,
        totalRevenue,
        fleetCardRevenue,
        massyCoupons,
        voucherRevenue,
        overShortTotal
      })
    }

    // Sort daily breakdown by date ascending
    dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date))

    // Get shifts with significant over/short (>$100 threshold)
    const significantDiscrepancies = shifts
      .filter(s => {
        const overShort = s.overShortTotal || 0
        return Math.abs(overShort) > 100
      })
      .map(s => ({
        date: s.date,
        shift: s.shift,
        supervisor: s.supervisor,
        overShortTotal: s.overShortTotal || 0,
        overShortExplained: s.overShortExplained,
        overShortExplanation: s.overShortExplanation
      }))
      .sort((a, b) => Math.abs(b.overShortTotal) - Math.abs(a.overShortTotal))

    // Convert supervisor stats to array
    const supervisorPerformance = Array.from(supervisorStats.entries()).map(([name, stats]) => ({
      name,
      shifts: stats.shifts,
      totalRevenue: stats.totalRevenue,
      averageRevenue: stats.shifts > 0 ? stats.totalRevenue / stats.shifts : 0,
      averageOverShort: stats.shifts > 0 ? stats.totalOverShort / stats.shifts : 0,
      shiftsWithDiscrepancy: stats.shiftsWithDiscrepancy,
      completionRate: 100 // Will be calculated when we have scheduled shifts data
    })).sort((a, b) => b.totalRevenue - a.totalRevenue)

    // Get completeness metrics
    const allShiftsForMonth = await prisma.shiftClose.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        date: true,
        shift: true,
        status: true
      }
    })

    const shiftsByDate = new Map<string, Array<{ shift: string; status: string }>>()
    allShiftsForMonth.forEach(shift => {
      if (!shiftsByDate.has(shift.date)) {
        shiftsByDate.set(shift.date, [])
      }
      shiftsByDate.get(shift.date)!.push({ shift: shift.shift, status: shift.status })
    })

    let incompleteDaysCount = 0
    let draftShiftsCount = 0
    shiftsByDate.forEach((dayShifts) => {
      const shiftTypes = dayShifts.map(s => s.shift)
      const hasDraft = dayShifts.some(s => s.status === 'draft')
      const hasStandard = shiftTypes.some(s => s === "6-1" || s === "1-9")
      const hasCustom = shiftTypes.some(s => s === "7:30 - 2")

      if (hasDraft) {
        incompleteDaysCount++
        draftShiftsCount += dayShifts.filter(s => s.status === 'draft').length
      } else if (hasCustom && hasStandard) {
        incompleteDaysCount++
      } else if (hasCustom) {
        if (dayShifts.length !== 1) {
          incompleteDaysCount++
        }
      } else {
        const has61 = shiftTypes.includes("6-1")
        const has19 = shiftTypes.includes("1-9")
        if (!has61 || !has19) {
          incompleteDaysCount++
        }
      }
    })

    const completeDaysCount = totalDays - incompleteDaysCount

    return NextResponse.json({
      year: targetYear,
      month: targetMonth,
      monthName: monthStart.toLocaleString('default', { month: 'long' }),
      period: {
        startDate,
        endDate,
        totalDays,
        workingDays,
        completeDays: completeDaysCount,
        incompleteDays: incompleteDaysCount
      },
      summary: {
        totalDeposits,
        debitAndCredit: totalDebitAndCredit,
        debit: totalDebit,
        credit: totalCredit,
        fleet: totalFleet,
        vouchers: totalVouchers,
        unleaded: totalUnleaded,
        diesel: totalDiesel,
        grandTotal,
        totalShifts: shifts.length,
        draftShifts: draftShiftsCount
      },
      overShortAnalysis: {
        totalOverShort,
        averageOverShort,
        shiftsWithOverShort,
        shiftsWithZeroOverShort,
        largestOver,
        largestShort,
        significantDiscrepancies
      },
      dailyBreakdown,
      supervisorPerformance,
      // Placeholder for financial data
      financial: {
        expenses: null, // Will be populated when expenses module is built
        payables: null,
        receivables: null,
        netProfit: null,
        cashFlow: null
      }
    })
  } catch (error) {
    console.error('Error fetching monthly report:', error)
    return NextResponse.json({ error: 'Failed to fetch monthly report' }, { status: 500 })
  }
}

