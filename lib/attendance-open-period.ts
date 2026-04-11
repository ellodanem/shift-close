const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Add whole UTC calendar days to a YYYY-MM-DD string. */
export function ymdAddUtcDays(ymd: string, days: number): string {
  const d = new Date(ymd + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Earlier of two ISO dates (YYYY-MM-DD). */
export function ymdMin(a: string, b: string): string {
  return a <= b ? a : b
}

/**
 * Optional recovery: if `ATTENDANCE_LOG_EARLIEST_START` is set to YYYY-MM-DD, the open
 * window start will not be later than that day (extends backward only). `none`/empty = off.
 */
export function attendanceBootstrapEarliestYmd(): string | null {
  const raw = process.env.ATTENDANCE_LOG_EARLIEST_START?.trim()
  if (!raw || raw.toLowerCase() === 'none' || !YMD.test(raw)) return null
  return raw
}

/**
 * Inclusive YYYY-MM-DD bounds for the **current open** attendance window after the last
 * **filed** pay period (greatest `createdAt`). Starts the earlier of (day after closed end,
 * calendar day of first save) so punches on the last closed day **after** the save stay in range.
 */
export function openAttendanceWindowAfterLastClosed(p: {
  endDate: string
  createdAt: Date
}): { startDate: string; endDate: string } {
  const today = todayYmdUtc()
  if (!YMD.test(p.endDate)) {
    return { startDate: today, endDate: today }
  }
  const dayAfterClose = ymdAddUtcDays(p.endDate, 1)
  const filedYmd = p.createdAt.toISOString().slice(0, 10)
  let startDate = ymdMin(dayAfterClose, filedYmd)
  if (startDate > today) {
    startDate = today
  }
  const boot = attendanceBootstrapEarliestYmd()
  if (boot) {
    startDate = ymdMin(startDate, boot)
  }
  return { startDate, endDate: today }
}
