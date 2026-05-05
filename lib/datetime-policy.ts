import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const BUSINESS_TIME_ZONE = 'America/St_Lucia'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export function isYmd(value: string): boolean {
  return YMD_RE.test(String(value).trim())
}

export function normalizeToUtcString(value: string): string {
  const s = String(value).trim()
  if (/Z|[+-]\d{2}:?\d{2}$/.test(s)) return s
  if (isYmd(s)) return s
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(s)) return s + 'Z'
  return s
}

export function ymdToUtcNoonDate(ymd: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim())
  if (!match) return new Date(ymd)
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const day = parseInt(match[3], 10)
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0))
}

export function toYmdInBusinessTz(instant: Date): string {
  return formatInTimeZone(instant, BUSINESS_TIME_ZONE, 'yyyy-MM-dd')
}

export function toYmdInTz(instant: Date, tz = BUSINESS_TIME_ZONE): string {
  return formatInTimeZone(instant, tz, 'yyyy-MM-dd')
}

export function zonedStartOfDayUtc(ymd: string, tz = BUSINESS_TIME_ZONE): Date {
  return fromZonedTime(`${ymd}T00:00:00`, tz)
}

export function addCalendarDaysYmd(ymd: string, deltaDays: number, tz = BUSINESS_TIME_ZONE): string {
  const anchor = fromZonedTime(`${ymd}T12:00:00`, tz)
  const shifted = new Date(anchor.getTime() + deltaDays * 24 * 60 * 60 * 1000)
  return formatInTimeZone(shifted, tz, 'yyyy-MM-dd')
}

export function zonedEndExclusiveUtc(ymd: string, tz = BUSINESS_TIME_ZONE): Date {
  return zonedStartOfDayUtc(addCalendarDaysYmd(ymd, 1, tz), tz)
}

export function businessTodayYmd(now = new Date()): string {
  return toYmdInBusinessTz(now)
}

export function businessYesterdayYmd(now = new Date()): string {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return toYmdInBusinessTz(yesterday)
}

export function formatDateOnlyForDisplay(ymd: string, locale = 'en-US'): string {
  const d = ymdToUtcNoonDate(ymd)
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function formatInstantForDisplay(
  instant: Date | string,
  locale = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof instant === 'string' ? new Date(normalizeToUtcString(instant)) : instant
  return d.toLocaleString(locale, options)
}
