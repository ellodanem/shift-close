/**
 * Which days the harvest agent may start and save in Cstore (only when its auto-save setting is on).
 * A day qualifies only when it is before the current business day and its End of Day is Complete
 * (every shift in and none still a draft).
 */
export function eligibleSaveDates(
  days: { date: string; status: string }[],
  todayYmd: string
): string[] {
  return days
    .filter((d) => d.status === 'Complete' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date < todayYmd)
    .map((d) => d.date)
    .sort()
}
