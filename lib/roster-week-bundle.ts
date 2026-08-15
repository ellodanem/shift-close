import { prisma } from '@/lib/prisma'
import {
  resolveOpenPayPeriodStart,
  ROSTER_OPEN_PERIOD_MAX_DAYS
} from '@/lib/roster-pay-period-hours'
import { addDays, isFutureRosterWeek, formatInputDate } from '@/lib/roster-week-client'

/** One server pass for roster grid: week entries + day-off + sick leave + holidays + prior week. */
export async function fetchRosterWeekBundle(weekStart: string, weekEnd: string) {
  const previousWeekStart = addDays(weekStart, -7)
  const todayYmd = formatInputDate(new Date())
  const lookbackStart = addDays(weekEnd, -(ROSTER_OPEN_PERIOD_MAX_DAYS - 1))
  const [week, previousWeek, lastPayPeriod, dayOffRequests, sickLeaves, callOuts, publicHolidays] =
    await Promise.all([
    prisma.rosterWeek.findFirst({
      where: { weekStart },
      include: { entries: true }
    }),
    prisma.rosterWeek.findFirst({
      where: { weekStart: previousWeekStart },
      include: { entries: true }
    }),
    prisma.payPeriod.findFirst({
      orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }],
      select: { endDate: true }
    }),
    prisma.staffDayOff.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      orderBy: [{ date: 'asc' }, { staffId: 'asc' }]
    }),
    prisma.staffSickLeave.findMany({
      where: {
        startDate: { lte: weekEnd },
        endDate: { gte: lookbackStart }
      },
      orderBy: { startDate: 'asc' }
    }),
    prisma.staffCallOut.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      include: {
        recordedBy: {
          select: { id: true, username: true, firstName: true, lastName: true }
        }
      },
      orderBy: [{ date: 'asc' }, { staffId: 'asc' }]
    }),
    prisma.publicHoliday.findMany({
      where: {
        countryCode: 'LC',
        date: { gte: lookbackStart, lte: weekEnd }
      },
      orderBy: { date: 'asc' }
    })
  ])

  const openPayPeriodStart = resolveOpenPayPeriodStart({
    lastPeriodEndDate: lastPayPeriod?.endDate ?? null,
    todayYmd,
    weekEndYmd: weekEnd
  })
  const priorPeriodEnd = addDays(weekStart, -1)
  const periodPriorEntries =
    openPayPeriodStart <= priorPeriodEnd
      ? await prisma.rosterEntry.findMany({
          where: {
            date: { gte: openPayPeriodStart, lte: priorPeriodEnd }
          },
          select: {
            staffId: true,
            date: true,
            shiftTemplateId: true
          }
        })
      : []

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
    openPayPeriodStart,
    periodPriorEntries,
    dayOffRequests,
    sickLeaves,
    callOuts,
    publicHolidays
  }
}
