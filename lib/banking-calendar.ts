import { addCalendarDaysYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'

/** Saturday and Sunday — bank does not process. */
export function isWeekendYmd(ymd: string): boolean {
  const dow = ymdToUtcNoonDate(ymd).getUTCDay()
  return dow === 0 || dow === 6
}

/** Weekday that is not a bank holiday. */
export function isBankingDay(ymd: string, bankHolidayDates: ReadonlySet<string>): boolean {
  if (isWeekendYmd(ymd)) return false
  return !bankHolidayDates.has(ymd)
}

/** First banking day on or after `ymd`. */
export function nextBankingDay(ymd: string, bankHolidayDates: ReadonlySet<string>): string {
  let cur = ymd
  for (let i = 0; i < 21; i++) {
    if (isBankingDay(cur, bankHolidayDates)) return cur
    cur = addCalendarDaysYmd(cur, 1)
  }
  return cur
}

export function dayOfWeekYmd(ymd: string): number {
  return ymdToUtcNoonDate(ymd).getUTCDay()
}

/** Monday on or after `ymd` (if `ymd` is Monday, returns `ymd`). */
export function mondayOnOrAfter(ymd: string): string {
  let cur = ymd
  for (let i = 0; i < 7; i++) {
    if (dayOfWeekYmd(cur) === 1) return cur
    cur = addCalendarDaysYmd(cur, 1)
  }
  return cur
}
