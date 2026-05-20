import { getListDisplayOverShort } from '@/lib/calculations'
import { prisma } from '@/lib/prisma'

export type BuildShiftsListOptions = {
  /** Inclusive minimum shift date (YYYY-MM-DD). Omit for full history. */
  sinceDate?: string
}

/** Build shift list payload (same shape as GET /api/shifts). */
export async function buildShiftsList(options?: BuildShiftsListOptions) {
  const sinceDate = options?.sinceDate?.trim()
  const shifts = await prisma.shiftClose.findMany({
    where: sinceDate ? { date: { gte: sinceDate } } : undefined,
    orderBy: { date: 'desc' },
    include: {
      corrections: true
    }
  })

  const shiftsByDate = new Map<string, typeof shifts>()
  shifts.forEach((shift) => {
    if (!shiftsByDate.has(shift.date)) {
      shiftsByDate.set(shift.date, [])
    }
    shiftsByDate.get(shift.date)!.push(shift)
  })

  const dayDepositScanStatus = new Map<string, boolean>()
  const dayDebitScanStatus = new Map<string, boolean>()
  shiftsByDate.forEach((dayShifts, date) => {
    let hasDepositScans = false
    let hasDebitScans = false
    dayShifts.forEach((shift) => {
      try {
        const depositUrls = shift.depositScanUrls ? JSON.parse(shift.depositScanUrls) : []
        const debitUrls = shift.debitScanUrls ? JSON.parse(shift.debitScanUrls) : []
        if (Array.isArray(depositUrls) && depositUrls.length > 0) {
          hasDepositScans = true
        }
        if (Array.isArray(debitUrls) && debitUrls.length > 0) {
          hasDebitScans = true
        }
      } catch {
        // Ignore parse errors
      }
    })
    dayDepositScanStatus.set(date, hasDepositScans)
    dayDebitScanStatus.set(date, hasDebitScans)
  })

  return shifts.map((shift) => {
    let recalculatedTotalDeposits = shift.totalDeposits

    if (!shift.totalDeposits || shift.totalDeposits === 0) {
      try {
        const depositsArray =
          typeof shift.deposits === 'string'
            ? JSON.parse(shift.deposits || '[]')
            : Array.isArray(shift.deposits)
              ? shift.deposits
              : []

        recalculatedTotalDeposits = depositsArray
          .filter(
            (d: unknown) =>
              d !== null && d !== undefined && !Number.isNaN(Number(d)) && Number(d) > 0
          )
          .reduce((sum: number, d: unknown) => sum + (Number(d) || 0), 0)
      } catch (err) {
        console.error('Error recalculating deposits for shift', shift.id, err)
      }
    }

    const netOverShort = getListDisplayOverShort({
      overShortTotal: shift.overShortTotal,
      osReviewed: shift.osReviewed
    })
    return {
      ...shift,
      totalDeposits: recalculatedTotalDeposits,
      hasDayDepositScans: dayDepositScanStatus.get(shift.date) || false,
      hasDayDebitScans: dayDebitScanStatus.get(shift.date) || false,
      netOverShort
    }
  })
}
