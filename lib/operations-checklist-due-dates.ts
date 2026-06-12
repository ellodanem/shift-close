import { addCalendarDaysYmd } from '@/lib/datetime-policy'
import {
  dayOfWeekYmd,
  isBankingDay,
  nextBankingDay
} from '@/lib/banking-calendar'

/** Shift work for calendar day W is due on W + 1. */
export function shiftEntryDueDate(workDate: string): string {
  return addCalendarDaysYmd(workDate, 1)
}

/**
 * When deposits for work date D reach the bank (receipt day).
 * Fri–Sun → next banking Monday; otherwise D + 1, adjusted for bank holidays.
 */
export function bankReceiptDate(
  depositDate: string,
  bankHolidayDates: ReadonlySet<string>
): string {
  const dow = dayOfWeekYmd(depositDate)
  if (dow === 5) return nextBankingDay(addCalendarDaysYmd(depositDate, 3), bankHolidayDates)
  if (dow === 6) return nextBankingDay(addCalendarDaysYmd(depositDate, 2), bankHolidayDates)
  if (dow === 0) return nextBankingDay(addCalendarDaysYmd(depositDate, 1), bankHolidayDates)

  let receipt = addCalendarDaysYmd(depositDate, 1)
  if (!isBankingDay(receipt, bankHolidayDates)) {
    receipt = nextBankingDay(receipt, bankHolidayDates)
  }
  return receipt
}

/**
 * Bank processes on receipt day; comparison is due the next banking day.
 */
export function depositComparisonDueDate(
  depositDate: string,
  bankHolidayDates: ReadonlySet<string>
): string {
  let processingDay = bankReceiptDate(depositDate, bankHolidayDates)
  if (!isBankingDay(processingDay, bankHolidayDates)) {
    processingDay = nextBankingDay(processingDay, bankHolidayDates)
  }
  let due = addCalendarDaysYmd(processingDay, 1)
  if (!isBankingDay(due, bankHolidayDates)) {
    due = nextBankingDay(due, bankHolidayDates)
  }
  return due
}

/** Monday YMD for the week containing `asOf` (Mon–Sun week). */
export function weekKeyMonday(asOf: string): string {
  const dow = dayOfWeekYmd(asOf)
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  return addCalendarDaysYmd(asOf, -daysFromMonday)
}

/** Sunday due date for a Mon-start week key. */
export function weekDueSunday(weekKey: string): string {
  return addCalendarDaysYmd(weekKey, 6)
}

export function compareYmd(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}
