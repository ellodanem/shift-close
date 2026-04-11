const YMD = /^\d{4}-\d{2}-\d{2}$/

function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Inclusive earliest day for Attendance logs when using the last-saved pay period.
 * If the saved report starts after this date, we still load from here so punches
 * on/before the report window are not dropped (first deployment / recovery).
 *
 * Override with env `ATTENDANCE_LOG_EARLIEST_START=YYYY-MM-DD`, or `none` to disable.
 */
export function effectiveAttendanceLogStart(savedStart: string): string {
  if (!YMD.test(savedStart)) return savedStart
  const fromEnv = process.env.ATTENDANCE_LOG_EARLIEST_START?.trim()
  if (fromEnv?.toLowerCase() === 'none' || fromEnv === '') {
    return savedStart
  }
  const floor = fromEnv && YMD.test(fromEnv) ? fromEnv : '2026-03-30'
  return savedStart > floor ? floor : savedStart
}

/** End date is at least today (UTC calendar day) so new punches stay visible after the saved report end. */
export function effectiveAttendanceLogEnd(savedEnd: string): string {
  if (!YMD.test(savedEnd)) return savedEnd
  const t = todayYmdUtc()
  return savedEnd < t ? t : savedEnd
}
