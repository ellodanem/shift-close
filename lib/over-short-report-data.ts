import { addCalendarDaysYmd, businessTodayYmd, isYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { buildDayReportsV2 } from '@/lib/day-reports-v2'
import { buildOverShortReport, type OverShortReport } from '@/lib/over-short-report'

export const OVER_SHORT_DEFAULT_DAYS = 7
export const OVER_SHORT_MAX_DAYS = 92

/** The range a request asks for. With nothing given it is the 7 days ending yesterday. */
export function resolveOverShortRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined
): { from: string; to: string } | { error: string } {
  const fromIn = fromRaw?.trim() || ''
  const toIn = toRaw?.trim() || ''
  if (fromIn && !isYmd(fromIn)) return { error: 'from must be YYYY-MM-DD' }
  if (toIn && !isYmd(toIn)) return { error: 'to must be YYYY-MM-DD' }

  const to = toIn || addCalendarDaysYmd(businessTodayYmd(), -1)
  const from = fromIn || addCalendarDaysYmd(to, -(OVER_SHORT_DEFAULT_DAYS - 1))
  if (from > to) return { error: 'from must be on or before to' }

  const days = Math.round((ymdToUtcNoonDate(to).getTime() - ymdToUtcNoonDate(from).getTime()) / 86_400_000) + 1
  if (days > OVER_SHORT_MAX_DAYS) return { error: `Pick a range of ${OVER_SHORT_MAX_DAYS} days or fewer` }
  return { from, to }
}

export async function loadOverShortReport(from: string, to: string): Promise<OverShortReport> {
  const days = await buildDayReportsV2({ sinceDate: from, untilDate: to })
  return buildOverShortReport(days, from, to)
}
