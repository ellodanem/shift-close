import type { DayReport } from '@/lib/types'

type DebitScanDay = Pick<DayReport, 'debitScans' | 'debitScanWaived' | 'totals'>

/** True when the day has no debit/credit totals, uploaded debit scans, or a missing-slip waiver. */
export function isDebitScanComplete(day: DebitScanDay): boolean {
  const needsDebits = day.totals.totalDebit > 0 || day.totals.totalCredit > 0
  if (!needsDebits) return true
  return day.debitScans.length > 0 || day.debitScanWaived === true
}
