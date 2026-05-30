import type { PrismaClient } from '@prisma/client'
import { currentWeekMonday, formatInputDate } from '@/lib/roster-week-client'

type DbClient = Pick<PrismaClient, 'rosterEntry' | 'staff'>

/** Remove a staff member from roster weeks that start after the current Monday. */
export async function purgeInactiveStaffFutureRosterEntries(
  prisma: DbClient,
  staffId: string,
  today = formatInputDate(new Date())
): Promise<number> {
  const cutoff = currentWeekMonday(today)
  const result = await prisma.rosterEntry.deleteMany({
    where: {
      staffId,
      rosterWeek: { weekStart: { gt: cutoff } }
    }
  })
  return result.count
}

/** Drop inactive staff from a roster entry list (used when saving future weeks). */
export async function filterEntriesExcludingInactiveStaff<T extends { staffId: string }>(
  prisma: DbClient,
  entries: T[]
): Promise<T[]> {
  const staffIds = [...new Set(entries.map((e) => e.staffId))]
  if (staffIds.length === 0) return entries

  const inactiveIds = new Set(
    (
      await prisma.staff.findMany({
        where: { id: { in: staffIds }, status: 'inactive' },
        select: { id: true }
      })
    ).map((s) => s.id)
  )
  if (inactiveIds.size === 0) return entries
  return entries.filter((e) => !inactiveIds.has(e.staffId))
}
