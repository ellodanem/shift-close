import { prisma } from '@/lib/prisma'
import type { DayReport } from '@/lib/types'
import { computeNetOverShort } from '@/lib/calculations'

/** Build End of Day reports (same shape as GET /api/days). */
export async function buildDayReports(): Promise<DayReport[]> {
  const shifts = await prisma.shiftClose.findMany({
    orderBy: { date: 'desc' },
    include: {
      corrections: true,
      overShortItems: true
    }
  })

  const byDate = new Map<string, typeof shifts>()
  shifts.forEach((shift) => {
    const date = shift.date
    if (!byDate.has(date)) {
      byDate.set(date, [])
    }
    byDate.get(date)!.push(shift)
  })

  const dayReports: DayReport[] = []
  const allDates = [...byDate.keys()]
  const openMissingSlipDates = new Set(
    allDates.length === 0
      ? []
      : (
          await prisma.missingDepositSlipAlert.findMany({
            where: { date: { in: allDates }, open: true },
            select: { date: true }
          })
        ).map((r) => r.date)
  )

  const securityWaiverByDate = new Map<string, string>(
    allDates.length === 0
      ? []
      : (
          await prisma.securityScanDayWaiver.findMany({
            where: { date: { in: allDates } },
            select: { date: true, note: true }
          })
        ).map((r) => [r.date, r.note ?? ''])
  )

  for (const [date, dayShifts] of byDate.entries()) {
    const shiftTypes = dayShifts.map((s) => s.shift)
    const hasDraft = dayShifts.some((s) => (s as { status?: string }).status === 'draft')
    const hasStandard = shiftTypes.some((s) => s === '6-1' || s === '1-9')
    const hasCustom = shiftTypes.some((s) => s === '7:30 - 2')

    let dayType: 'Standard' | 'Custom' = 'Standard'
    let status: 'Complete' | 'Incomplete' | 'Invalid mix' = 'Complete'

    if (hasCustom && hasStandard) {
      status = 'Invalid mix'
    } else if (hasCustom) {
      dayType = 'Custom'
      if (dayShifts.length !== 1) {
        status = 'Incomplete'
      }
    } else {
      const has61 = shiftTypes.includes('6-1')
      const has19 = shiftTypes.includes('1-9')
      if (!has61 || !has19) {
        status = 'Incomplete'
      }
    }

    if (hasDraft && status === 'Complete') {
      status = 'Incomplete'
    }

    const totals = {
      overShortTotal: dayShifts.reduce((sum, s) => {
        const net = computeNetOverShort(
          s.overShortTotal || 0,
          (s.overShortItems ?? []).map((i) => ({
            type: i.type,
            amount: i.amount,
            noteOnly: i.noteOnly ?? false
          }))
        )
        return sum + net
      }, 0),
      totalDeposits: dayShifts.reduce((sum, s) => sum + (s.totalDeposits || 0), 0),
      totalCredit: dayShifts.reduce((sum, s) => sum + s.otherCredit, 0),
      totalDebit: dayShifts.reduce((sum, s) => sum + s.systemDebit, 0),
      systemCashTotal: dayShifts.reduce((sum, s) => sum + s.systemCash + s.systemChecks, 0),
      countCashTotal: dayShifts.reduce((sum, s) => sum + s.countCash + s.countChecks, 0),
      totalUnleaded: dayShifts.reduce((sum, s) => sum + s.unleaded, 0),
      totalDiesel: dayShifts.reduce((sum, s) => sum + s.diesel, 0)
    }

    const depositSet = new Set<string>()
    const debitSet = new Set<string>()
    const securitySet = new Set<string>()

    dayShifts.forEach((s) => {
      try {
        const depositUrls = s.depositScanUrls ? JSON.parse(s.depositScanUrls) : []
        const debitUrls = s.debitScanUrls ? JSON.parse(s.debitScanUrls) : []
        const secRaw = s.securityScanUrls
        const securityUrls = secRaw ? JSON.parse(secRaw) : []

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
        if (Array.isArray(securityUrls)) {
          securityUrls.forEach((url: string) => {
            if (url) securitySet.add(url)
          })
        }
      } catch {
        // skip
      }
    })

    const depositScans = Array.from(depositSet)
    const debitScans = Array.from(debitSet)
    const securityScans = Array.from(securitySet)

    dayReports.push({
      date,
      dayType,
      status,
      shifts: dayShifts.map((s) => ({
        id: s.id,
        date: s.date,
        shift: s.shift as '6-1' | '1-9' | '7:30 - 2',
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
        overShortTotal: computeNetOverShort(
          s.overShortTotal || 0,
          (s.overShortItems ?? []).map((i) => ({
            type: i.type,
            amount: i.amount,
            noteOnly: i.noteOnly ?? false
          }))
        ),
        totalDeposits: s.totalDeposits || 0,
        createdAt: s.createdAt,
        hasRedFlag: false
      })),
      totals,
      depositScans,
      debitScans,
      securityScans,
      securityScanWaived: securityWaiverByDate.has(date),
      securityScanWaiverNote: securityWaiverByDate.get(date) ?? '',
      missingDepositSlipAlertOpen: openMissingSlipDates.has(date)
    })
  }

  return dayReports
}
