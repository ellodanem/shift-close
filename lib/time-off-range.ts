import { addCalendarDaysYmd, isYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { normalizeCallOutDate } from '@/lib/call-outs'

/** Max inclusive span for Time Off list/bundle queries (≈1 year). */
export const TIME_OFF_MAX_RANGE_DAYS = 366

/** Safety cap per entity type in bundle responses. */
export const TIME_OFF_LIST_ROW_CAP = 500

export type TimeOffRange = {
  startDate: string
  endDate: string
}

export type TimeOffRangeError = {
  error: string
  status: number
}

function parseYmd(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const fromCallOut = normalizeCallOutDate(raw)
  if (fromCallOut) return fromCallOut
  const s = raw.trim()
  return isYmd(s) ? s : null
}

function daysInclusive(start: string, end: string): number {
  const a = ymdToUtcNoonDate(start).getTime()
  const b = ymdToUtcNoonDate(end).getTime()
  if (b < a) return 0
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1
}

/**
 * Validates a YYYY-MM-DD range for Time Off reads.
 * Requires both bounds; enforces start <= end and max span.
 */
export function validateTimeOffDateRange(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined,
  maxDays: number = TIME_OFF_MAX_RANGE_DAYS
): TimeOffRange | TimeOffRangeError {
  const startDate = parseYmd(startRaw)
  const endDate = parseYmd(endRaw)

  if (!startDate || !endDate) {
    return {
      error: 'startDate and endDate are required (YYYY-MM-DD)',
      status: 400
    }
  }

  if (endDate < startDate) {
    return {
      error: 'endDate must be on or after startDate',
      status: 400
    }
  }

  const span = daysInclusive(startDate, endDate)
  if (span > maxDays) {
    return {
      error: `Date range cannot exceed ${maxDays} days`,
      status: 400
    }
  }

  return { startDate, endDate }
}

/** Clamp custom end so span from start does not exceed maxDays. */
export function clampRangeEnd(startDate: string, endDate: string, maxDays: number): string {
  const validated = validateTimeOffDateRange(startDate, endDate, maxDays)
  if ('error' in validated) {
    const maxEnd = addCalendarDaysYmd(startDate, maxDays - 1)
    return endDate > maxEnd ? maxEnd : endDate < startDate ? startDate : endDate
  }
  return endDate
}
