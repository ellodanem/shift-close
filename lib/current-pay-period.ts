/**
 * Bi-weekly pay window used by Pay Days API and Attendance log defaults (days 1–15, 16–end).
 */
export function currentBiweeklyPeriodBounds(now = new Date()): {
  periodStart: string
  periodEnd: string
} {
  const day = now.getDate()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()

  const periodStart = day <= 15 ? `${year}-${month}-01` : `${year}-${month}-16`
  const periodEnd =
    day <= 15 ? `${year}-${month}-15` : `${year}-${month}-${String(lastDay).padStart(2, '0')}`

  return { periodStart, periodEnd }
}
