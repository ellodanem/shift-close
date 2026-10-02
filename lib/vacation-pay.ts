/** Straight-time hours paid for one hourly vacation day. A full semi-monthly block of 86.67 hours is about 14.45 of these days. */
export const DEFAULT_VACATION_HOURS_PER_DAY = 6
export const MIN_VACATION_HOURS_PER_DAY = 0
export const MAX_VACATION_HOURS_PER_DAY = 24

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function ymdUtc(ymd: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/** Inclusive calendar days from start through end. Zero when the range is empty or invalid. */
export function inclusiveDayCount(startYmd: string, endYmd: string): number {
  const start = ymdUtc(startYmd)
  const end = ymdUtc(endYmd)
  if (start == null || end == null || end < start) return 0
  return Math.floor((end - start) / 86400000) + 1
}

/**
 * Vacation dates that fall inside the pay period.
 * A vacation that crosses the 15th is split: each run pays only its own days.
 */
export function vacationDaysInPeriod(
  vacationStart: string | null | undefined,
  vacationEnd: string | null | undefined,
  periodStart: string,
  periodEnd: string
): number {
  const start = (vacationStart ?? '').trim()
  const end = (vacationEnd ?? '').trim()
  if (!start || !end) return 0
  const overlapStart = start > periodStart ? start : periodStart
  const overlapEnd = end < periodEnd ? end : periodEnd
  return inclusiveDayCount(overlapStart, overlapEnd)
}

export function normalizeVacationHoursPerDay(value: unknown, fallback = DEFAULT_VACATION_HOURS_PER_DAY): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  const rounded = round2(n)
  if (rounded < MIN_VACATION_HOURS_PER_DAY || rounded > MAX_VACATION_HOURS_PER_DAY) return fallback
  return rounded
}

/** Null when the typed value is outside 0–24 hours, or has more than two decimal places. */
export function parseVacationHoursPerDayInput(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const n = round2(Number(trimmed))
  if (n < MIN_VACATION_HOURS_PER_DAY || n > MAX_VACATION_HOURS_PER_DAY) return null
  return n
}

/** Hourly vacation is days × hours per day × rate. Salaried staff are not paid this way. */
export function vacationEarning(input: {
  payType?: unknown
  vacationDays?: number
  hourlyRate?: number
  hoursPerDay?: number
}): { vacationDays: number; vacationHours: number; vacationPay: number } {
  if (input.payType === 'salaried') {
    return { vacationDays: 0, vacationHours: 0, vacationPay: 0 }
  }
  const vacationDays = round2(Math.max(0, Number(input.vacationDays) || 0))
  const hoursPerDay = normalizeVacationHoursPerDay(input.hoursPerDay)
  const rate = round2(Math.max(0, Number(input.hourlyRate) || 0))
  const vacationHours = round2(vacationDays * hoursPerDay)
  return {
    vacationDays,
    vacationHours,
    vacationPay: round2(vacationHours * rate)
  }
}
