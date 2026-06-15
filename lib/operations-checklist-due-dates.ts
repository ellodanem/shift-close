import { fromZonedTime } from 'date-fns-tz'
import { addCalendarDaysYmd, BUSINESS_TIME_ZONE } from '@/lib/datetime-policy'
import {
  dayOfWeekYmd,
  isBankingDay,
  nextBankingDay
} from '@/lib/banking-calendar'

/** Hour (0–23) on W+1 when shift entry becomes due in America/St_Lucia. */
export const SHIFT_ENTRY_GRACE_HOUR = 6

/** Shift work for calendar day W is due on W + 1. */
export function shiftEntryDueDate(workDate: string): string {
  return addCalendarDaysYmd(workDate, 1)
}

/** Shift entry is overdue from W + 2 onward. */
export function shiftEntryOverdueDate(workDate: string): string {
  return addCalendarDaysYmd(workDate, 2)
}

export function isBeforeShiftDueGrace(now: Date, dueDateYmd: string): boolean {
  const graceInstant = fromZonedTime(
    `${dueDateYmd}T${String(SHIFT_ENTRY_GRACE_HOUR).padStart(2, '0')}:00:00`,
    BUSINESS_TIME_ZONE
  )
  return now.getTime() < graceInstant.getTime()
}

export type ShiftEntryTiming = 'not_due' | 'due' | 'overdue'

/**
 * Shift entry timing with 6 AM grace on W+1 and overdue from W+2.
 * Work for calendar day W is not due while today <= W.
 */
export function shiftEntryTimingStatus(
  asOfYmd: string,
  workDate: string,
  now: Date = new Date()
): ShiftEntryTiming {
  if (compareYmd(asOfYmd, workDate) <= 0) return 'not_due'

  const dueDate = shiftEntryDueDate(workDate)
  const overdueDate = shiftEntryOverdueDate(workDate)

  if (compareYmd(asOfYmd, overdueDate) >= 0) return 'overdue'

  if (compareYmd(asOfYmd, dueDate) >= 0) {
    if (compareYmd(asOfYmd, dueDate) === 0 && isBeforeShiftDueGrace(now, dueDate)) {
      return 'not_due'
    }
    return 'due'
  }

  return 'not_due'
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

/** Sunday YMD for a Mon-start week key. */
export function weekDueSunday(weekKey: string): string {
  return addCalendarDaysYmd(weekKey, 6)
}

export function compareYmd(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** Inclusive YMD range [start, end]. */
export function enumerateYmdRange(start: string, end: string): string[] {
  if (compareYmd(start, end) > 0) return []
  const out: string[] = []
  let cur = start
  while (compareYmd(cur, end) <= 0) {
    out.push(cur)
    cur = addCalendarDaysYmd(cur, 1)
  }
  return out
}
