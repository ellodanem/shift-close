import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    let startDate: string
    let endDate: string
    let targetYear: number
    let targetMonth: number
    let monthStart: Date

    // Handle custom date range
    if (customStartDate && customEndDate) {
      // Support both month strings (YYYY-MM) and full dates (YYYY-MM-DD)
      const monthRegex = /^\d{4}-\d{2}$/

      if (monthRegex.test(customStartDate) && monthRegex.test(customEndDate)) {
        // Custom range by month
        const [startYear, startMonth] = customStartDate.split('-').map(Number)
        const [endYear, endMonth] = customEndDate.split('-').map(Number)

        const start = new Date(startYear, startMonth - 1, 1)
        const end = new Date(endYear, endMonth, 0) // last day of end month

        startDate = start.toISOString().split('T')[0]
        endDate = end.toISOString().split('T')[0]
        targetYear = start.getFullYear()
        targetMonth = start.getMonth() + 1
        monthStart = start
      } else {
        // Fallback: treat as explicit dates (YYYY-MM-DD)
        startDate = customStartDate
        endDate = customEndDate
        const start = new Date(customStartDate + 'T00:00:00')
        targetYear = start.getFullYear()
        targetMonth = start.getMonth() + 1
        monthStart = start
      }
    } else {
      // Default to current month if not specified
      const now = new Date()
      targetYear = year ? parseInt(year) : now.getFullYear()
      targetMonth = month ? parseInt(month) : now.getMonth() + 1

      // Calculate date range for the month
      monthStart = new Date(targetYear, targetMonth - 1, 1)
      const monthEnd = new Date(targetYear, targetMonth, 0)
      startDate = monthStart.toISOString().split('T')[0]
      endDate = monthEnd.toISOString().split('T')[0]
    }

    // Fetch all shifts for the month
    const shifts = await prisma.shiftClose.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate
        }
      }
    })

    // Aggregate totals
    let totalDeposits = 0
    let totalDebit = 0
    let totalCredit = 0
    let totalFleet = 0
    let totalVouchers = 0
    let totalInhouse = 0

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

      // Debit & Credit
      totalDebit += shift.systemDebit || 0
      totalCredit += shift.otherCredit || 0
      
      // Fleet
      totalFleet += shift.systemFleet || 0
      
      // Vouchers/Coupons (Massy Coupons)
      totalVouchers += shift.systemMassyCoupons || 0

      // In-House / Customer Accounts
      // NOTE: We intentionally do NOT include this in grandTotal so the
      // dashboard "Grand Total" remains cash-like; In-House is shown
      // separately as Customer Charges (MTD).
      totalInhouse += shift.systemInhouse || 0
    })

    const totalDebitAndCredit = totalDebit + totalCredit
    const grandTotal = totalDeposits + totalDebitAndCredit + totalFleet + totalVouchers

    // Calculate status metrics
    // 1. Last shift recorded
    const lastShift = await prisma.shiftClose.findFirst({
      where: {
        OR: [
          { status: 'closed' },
          { status: 'reviewed' }
        ]
      },
      orderBy: { createdAt: 'desc' },
      select: {
        date: true,
        shift: true,
        createdAt: true
      }
    })

    // 2. Shifts pending review (over/short not zero and not explained)
    // Get all closed/reopened shifts first, then filter in code
    const allClosedShifts = await prisma.shiftClose.findMany({
      where: {
        OR: [
          { status: 'closed' },
          { status: 'reopened' }
        ]
      },
      select: {
        id: true,
        overShortTotal: true,
        overShortExplained: true,
        overShortExplanation: true
      }
    })
    
    const pendingReviewShifts = allClosedShifts.filter(shift => {
      const overShort = shift.overShortTotal || 0
      if (overShort === 0) return false
      
      const isExplained = shift.overShortExplained === true && 
                         shift.overShortExplanation && 
                         shift.overShortExplanation.trim() !== ''
      
      return !isExplained
    })

    // 3. Incomplete days - check all days in the month
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

    // Group by date
    const shiftsByDate = new Map<string, Array<{ shift: string; status: string }>>()
    allShiftsForMonth.forEach(shift => {
      if (!shiftsByDate.has(shift.date)) {
        shiftsByDate.set(shift.date, [])
      }
      shiftsByDate.get(shift.date)!.push({ shift: shift.shift, status: shift.status })
    })

    let incompleteDaysCount = 0
    shiftsByDate.forEach((dayShifts, date) => {
      const shiftTypes = dayShifts.map(s => s.shift)
      const hasDraft = dayShifts.some(s => s.status === 'draft')
      const hasStandard = shiftTypes.some(s => s === "6-1" || s === "1-9")
      const hasCustom = shiftTypes.some(s => s === "7:30 - 2")

      if (hasDraft) {
        incompleteDaysCount++
      } else if (hasCustom && hasStandard) {
        // Invalid mix - treat as incomplete
        incompleteDaysCount++
      } else if (hasCustom) {
        // Custom day - should have exactly one shift
        if (dayShifts.length !== 1) {
          incompleteDaysCount++
        }
      } else {
        // Standard day - should have both 6-1 and 1-9
        const has61 = shiftTypes.includes("6-1")
        const has19 = shiftTypes.includes("1-9")
        if (!has61 || !has19) {
          incompleteDaysCount++
        }
      }
    })

    // 4. Over/Short trend (total for the month)
    let totalOverShort = 0
    shifts.forEach(shift => {
      totalOverShort += shift.overShortTotal || 0
    })

    return NextResponse.json({
      year: targetYear,
      month: targetMonth,
      monthName: monthStart.toLocaleString('default', { month: 'long' }),
      totals: {
        deposits: totalDeposits,
        debitAndCredit: totalDebitAndCredit,
        debit: totalDebit,
        credit: totalCredit,
        fleet: totalFleet,
        vouchers: totalVouchers,
        inhouse: totalInhouse,
        grandTotal
      },
      status: {
        lastShift: lastShift ? {
          date: lastShift.date,
          shift: lastShift.shift,
          createdAt: lastShift.createdAt.toISOString()
        } : null,
        pendingReviewCount: pendingReviewShifts.length,
        incompleteDaysCount,
        totalOverShort
      }
    })
  } catch (error) {
    console.error('Error fetching dashboard month summary:', error)
    return NextResponse.json({ error: 'Failed to fetch month summary' }, { status: 500 })
  }
}

