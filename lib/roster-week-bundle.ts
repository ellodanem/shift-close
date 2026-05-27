import { prisma } from '@/lib/prisma'
import { addDays } from '@/lib/roster-week-client'

/** One server pass for roster grid: week entries + day-off + sick leave + holidays + prior week. */
export async function fetchRosterWeekBundle(weekStart: string, weekEnd: string) {
  const previousWeekStart = addDays(weekStart, -7)
  const [week, previousWeek, dayOffRequests, sickLeaves, publicHolidays] = await Promise.all([
    prisma.rosterWeek.findFirst({
      where: { weekStart },
      include: { entries: true }
    }),
    prisma.rosterWeek.findFirst({
      where: { weekStart: previousWeekStart },
      include: { entries: true }
    }),
    prisma.staffDayOff.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      orderBy: [{ date: 'asc' }, { staffId: 'asc' }]
    }),
    prisma.staffSickLeave.findMany({
      where: {
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart }
      },
      orderBy: { startDate: 'asc' }
    }),
    prisma.publicHoliday.findMany({
      where: {
        countryCode: 'LC',
        date: { gte: weekStart, lte: weekEnd }
      },
      orderBy: { date: 'asc' }
    })
  ])

  return {
    week,
    entries: week?.entries ?? [],
    previousWeekStart,
    previousWeekEntries: previousWeek?.entries ?? [],
    dayOffRequests,
    sickLeaves,
    publicHolidays
  }
}
