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

/** Pay window immediately before `currentBiweeklyPeriodBounds`. */
export function previousBiweeklyPeriodBounds(now = new Date()): {
  periodStart: string
  periodEnd: string
} {
  const { periodStart } = currentBiweeklyPeriodBounds(now)
  const [y, m, d] = periodStart.split('-').map(Number)
  if (d === 16) {
    const mm = String(m).padStart(2, '0')
    return { periodStart: `${y}-${mm}-01`, periodEnd: `${y}-${mm}-15` }
  }
  const prev = new Date(Date.UTC(y, m - 2, 1))
  const py = prev.getUTCFullYear()
  const pm = prev.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate()
  const mm = String(pm).padStart(2, '0')
  return {
    periodStart: `${py}-${mm}-16`,
    periodEnd: `${py}-${mm}-${String(lastDay).padStart(2, '0')}`
  }
}
