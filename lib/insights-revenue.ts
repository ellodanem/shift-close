/**
 * Revenue aggregation for Insights — matches dashboard month-summary "Grand Total":
 * deposits + debit & credit + fleet + vouchers (Massy).
 * In-house is excluded from grand total (same as dashboard).
 */

export type ShiftCloseRevenueInput = {
  date: string
  deposits: unknown
  systemDebit: number | null
  otherCredit: number | null
  systemFleet: number | null
  systemMassyCoupons: number | null
}

export function sumDepositsFromShift(shift: Pick<ShiftCloseRevenueInput, 'deposits'>): number {
  try {
    const depositsArray =
      typeof shift.deposits === 'string'
        ? JSON.parse(shift.deposits || '[]')
        : Array.isArray(shift.deposits)
          ? shift.deposits
          : []
    return (depositsArray as unknown[])
      .filter((d) => d !== null && d !== undefined && !Number.isNaN(Number(d)) && Number(d) > 0)
      .reduce((sum: number, d) => sum + (Number(d) || 0), 0)
  } catch {
    return 0
  }
}

export function perShiftGrandTotal(shift: ShiftCloseRevenueInput): number {
  const dep = sumDepositsFromShift(shift)
  const debit = shift.systemDebit || 0
  const credit = shift.otherCredit || 0
  const fleet = shift.systemFleet || 0
  const vouchers = shift.systemMassyCoupons || 0
  return dep + debit + credit + fleet + vouchers
}

export function aggregateRangeRevenue(shifts: ShiftCloseRevenueInput[]): {
  grandTotal: number
  totalDeposits: number
  totalDebitAndCredit: number
  totalDebit: number
  totalCredit: number
  totalFleet: number
  totalVouchers: number
  shiftCount: number
  byDay: Array<{
    date: string
    grandTotal: number
    shiftCount: number
  }>
} {
  let totalDeposits = 0
  let totalDebit = 0
  let totalCredit = 0
  let totalFleet = 0
  let totalVouchers = 0
  const dayMap = new Map<string, { grand: number; count: number }>()

  for (const shift of shifts) {
    const dep = sumDepositsFromShift(shift)
    const db = shift.systemDebit || 0
    const cr = shift.otherCredit || 0
    const fl = shift.systemFleet || 0
    const vo = shift.systemMassyCoupons || 0

    totalDeposits += dep
    totalDebit += db
    totalCredit += cr
    totalFleet += fl
    totalVouchers += vo

    const g = dep + db + cr + fl + vo
    const prev = dayMap.get(shift.date) ?? { grand: 0, count: 0 }
    dayMap.set(shift.date, { grand: prev.grand + g, count: prev.count + 1 })
  }

  const totalDebitAndCredit = totalDebit + totalCredit
  const grandTotal = totalDeposits + totalDebitAndCredit + totalFleet + totalVouchers

  const byDay = [...dayMap.entries()]
    .map(([date, { grand, count }]) => ({ date, grandTotal: grand, shiftCount: count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    grandTotal,
    totalDeposits,
    totalDebitAndCredit,
    totalDebit,
    totalCredit,
    totalFleet,
    totalVouchers,
    shiftCount: shifts.length,
    byDay
  }
}
