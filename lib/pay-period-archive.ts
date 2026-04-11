import { prisma } from '@/lib/prisma'

/**
 * When the most recently **filed** pay period report was first saved (`createdAt`).
 * Default attendance shows only punches **strictly after** this instant; everything at or
 * before it is treated as archived unless the client passes includeArchived=1.
 *
 * PATCH updates to the same report do not move `createdAt`, so editing notes does not
 * re-close the period.
 */
export async function getLatestClosedPayPeriodCreatedAt(): Promise<Date | null> {
  const p = await prisma.payPeriod.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true }
  })
  return p?.createdAt ?? null
}
