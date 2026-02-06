import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DayReport } from '@/lib/types'

export async function GET() {
  try {
    const shifts = await prisma.shiftClose.findMany({
      orderBy: { date: 'desc' },
      include: { corrections: true }
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
    
    const dayReports: DayReport[] = []
    
    for (const [date, dayShifts] of byDate.entries()) {
      const shiftTypes = dayShifts.map(s => s.shift)
      const hasDraft = dayShifts.some(s => (s as any).status === 'draft')
      const hasStandard = shiftTypes.some(s => s === "6-1" || s === "1-9")
      const hasCustom = shiftTypes.some(s => s === "7:30 - 2")
      
      let dayType: "Standard" | "Custom" = "Standard"
      let status: "Complete" | "Incomplete" | "Invalid mix" = "Complete"
      
      if (hasCustom && hasStandard) {
        status = "Invalid mix"
      } else if (hasCustom) {
        dayType = "Custom"
        if (dayShifts.length !== 1) {
          status = "Incomplete" // Should be exactly one 7:30 - 2 shift
        }
      } else {
        // Standard day
        const has61 = shiftTypes.includes("6-1")
        const has19 = shiftTypes.includes("1-9")
        if (!has61 || !has19) {
          status = "Incomplete"
        }
      }

      // If any shift is still in draft, treat the day as incomplete
      if (hasDraft && status === "Complete") {
        status = "Incomplete"
      }
      
      const totals = {
        overShortTotal: dayShifts.reduce((sum, s) => sum + (s.overShortTotal || 0), 0),
        totalDeposits: dayShifts.reduce((sum, s) => sum + (s.totalDeposits || 0), 0),
        // Total Credit should reflect the separate Credit field in "Other Items", not the main table "Credits" row
        totalCredit: dayShifts.reduce((sum, s) => sum + s.otherCredit, 0),
        totalDebit: dayShifts.reduce((sum, s) => sum + s.systemDebit, 0),
        // System Cash+Check: POS system cash + system checks
        systemCashTotal: dayShifts.reduce((sum, s) => sum + s.systemCash + s.systemChecks, 0),
        // Counted Cash+Check: use the summary row logic (cash + checks), not cash alone
        countCashTotal: dayShifts.reduce((sum, s) => sum + s.countCash + s.countChecks, 0),
        totalUnleaded: dayShifts.reduce((sum, s) => sum + s.unleaded, 0),
        totalDiesel: dayShifts.reduce((sum, s) => sum + s.diesel, 0)
      }
      
      // Aggregate all deposit and debit scans for the day
      // Day-level document scans: uploads are written to all shifts for the date,
      // but to be robust we aggregate from all shifts and de-duplicate by URL.
      const depositSet = new Set<string>()
      const debitSet = new Set<string>()
      
      dayShifts.forEach((s) => {
        try {
          const depositUrls = s.depositScanUrls ? JSON.parse(s.depositScanUrls) : []
          const debitUrls = s.debitScanUrls ? JSON.parse(s.debitScanUrls) : []
          
          if (Array.isArray(depositUrls)) {
            depositUrls.forEach((url: string) => {
              if (url) depositSet.add(url)
            })
          }
          if (Array.isArray(debitUrls)) {
            debitUrls.forEach((url: string) => {
              if (url) debitSet.add(url)
            })
          }
        } catch {
          // Skip invalid JSON for this shift
        }
      })
      
      const depositScans = Array.from(depositSet)
      const debitScans = Array.from(debitSet)
      
      dayReports.push({
        date,
        dayType,
        status,
        shifts: dayShifts.map(s => ({
          id: s.id,
          date: s.date,
          shift: s.shift as "6-1" | "1-9" | "7:30 - 2",
          supervisor: s.supervisor,
          systemCash: s.systemCash,
          systemChecks: s.systemChecks,
          systemCredit: s.systemCredit,
          systemDebit: s.systemDebit,
          otherCredit: s.otherCredit,
          systemInhouse: s.systemInhouse,
          systemFleet: s.systemFleet,
          systemMassyCoupons: s.systemMassyCoupons,
          countCash: s.countCash,
          countChecks: s.countChecks,
          countCredit: s.countCredit,
          countInhouse: s.countInhouse,
          countFleet: s.countFleet,
          countMassyCoupons: s.countMassyCoupons,
          unleaded: s.unleaded,
          diesel: s.diesel,
          deposits: JSON.parse(s.deposits),
          notes: s.notes,
          overShortCash: s.overShortCash || 0,
          overShortTotal: s.overShortTotal || 0,
          totalDeposits: s.totalDeposits || 0,
          createdAt: s.createdAt,
          hasRedFlag: (s.overShortTotal || 0) !== 0 && s.notes.trim() === ""
        })),
        totals,
        depositScans,
        debitScans
      })
    }
    
    return NextResponse.json(dayReports)
  } catch (error) {
    console.error('Error fetching day reports:', error)
    return NextResponse.json({ error: 'Failed to fetch day reports' }, { status: 500 })
  }
}

