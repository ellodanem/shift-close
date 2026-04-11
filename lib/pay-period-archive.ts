import { prisma } from '@/lib/prisma'

export type LatestFiledPayPeriodSlice = {
  createdAt: Date
  endDate: string
}

/**
 * Last filed pay period (greatest `createdAt`): used to decide which punches are
 * “archived” in the default Attendance view.
 *
 * A punch is shown by default if **either**:
 * - its time is after the **closed period’s last calendar day** (UTC end of `endDate`), or
 * - its time is **strictly after** the report’s first-save instant (`createdAt`).
 *
 * So open-period punches (after the closed window) are not hidden just because they
 * occurred before `createdAt` when the report was filed late or back-dated.
 */
export async function getLatestFiledPayPeriodForAttendance(): Promise<LatestFiledPayPeriodSlice | null> {
  const p = await prisma.payPeriod.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, endDate: true }
  })
  if (!p) return null
  return { createdAt: p.createdAt, endDate: p.endDate }
}
