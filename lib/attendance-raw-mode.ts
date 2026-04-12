/**
 * Temporary / ops: when truthy, Attendance skips pay-period archive filtering and the UI
 * loads every punch (no date window). Set in `.env` as `ATTENDANCE_RAW_LOGS=1`.
 */
export function attendanceRawLogsEnv(): boolean {
  const v = process.env.ATTENDANCE_RAW_LOGS?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}
