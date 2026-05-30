import { prisma } from '@/lib/prisma'
import { addDays, isFutureRosterWeek, formatInputDate } from '@/lib/roster-week-client'

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

  let entries = week?.entries ?? []

  // Advance rosters may still list staff who were later inactivated — drop them on load.
  if (week && isFutureRosterWeek(weekStart, formatInputDate(new Date())) && entries.length > 0) {
    const entryStaffIds = [...new Set(entries.map((e) => e.staffId))]
    const inactiveIds = new Set(
      (
        await prisma.staff.findMany({
          where: { id: { in: entryStaffIds }, status: 'inactive' },
          select: { id: true }
        })
      ).map((s) => s.id)
    )
    if (inactiveIds.size > 0) {
      await prisma.rosterEntry.deleteMany({
        where: {
          rosterWeekId: week.id,
          staffId: { in: [...inactiveIds] }
        }
      })
      entries = entries.filter((e) => !inactiveIds.has(e.staffId))
    }
  }

  return {
    week,
    entries,
    previousWeekStart,
    previousWeekEntries: previousWeek?.entries ?? [],
    dayOffRequests,
    sickLeaves,
    publicHolidays
  }
}
