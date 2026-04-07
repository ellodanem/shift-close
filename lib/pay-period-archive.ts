import { prisma } from '@/lib/prisma'

/**
 * Instant after which punches stay visible on the default Attendance log:
 * `createdAt` of the saved pay period with the latest `endDate` (tie-break: latest `createdAt`).
 * Punches at or before this instant are treated as archived (hidden unless includeArchived).
 */
export async function getLatestSavedPayPeriodCutoffInstant(): Promise<Date | null> {
  const last = await prisma.payPeriod.findFirst({
    orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }]
  })
  return last?.createdAt ?? null
}
