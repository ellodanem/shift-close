import { prisma } from '@/lib/prisma'

export type LatestFiledPayPeriodSlice = {
  startDate: string
  endDate: string
}

/**
 * Last filed pay period (greatest `createdAt`): its **startDate/endDate** define which
 * punches are archived in the default Attendance view (inclusive calendar window, UTC
 * day boundaries), not the wall-clock time the report was saved.
 */
export async function getLatestFiledPayPeriodForAttendance(): Promise<LatestFiledPayPeriodSlice | null> {
  const p = await prisma.payPeriod.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { startDate: true, endDate: true }
  })
  if (!p) return null
  return { startDate: p.startDate, endDate: p.endDate }
}
