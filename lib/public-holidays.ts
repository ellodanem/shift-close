import type { PrismaClient } from '@prisma/client'

/** Dates (YYYY-MM-DD) where the station is fully closed — no roster shifts allowed. */
export async function getStationClosedDates(
  tx: Pick<PrismaClient, 'publicHoliday'>,
  dates: string[],
  countryCode = 'LC'
): Promise<Set<string>> {
  if (dates.length === 0) return new Set()
  const distinct = [...new Set(dates)]
  const rows = await tx.publicHoliday.findMany({
    where: {
      countryCode,
      stationClosed: true,
      date: { in: distinct }
    },
    select: { date: true }
  })
  return new Set(rows.map((r) => r.date))
}
