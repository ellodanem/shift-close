import type { Prisma } from '@prisma/client'
import { fromZonedTime } from 'date-fns-tz'
import { addCalendarYmd } from '@/lib/present-absence'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Inclusive calendar [startYmd, endYmd] in station `timeZone` → half-open UTC instant range for `punchTime`.
 * Matches `/api/attendance/logs` date filtering.
 */
export function punchTimeStationWindowBounds(startYmd: string, endYmd: string, timeZone: string): {
  gte: Date
  lt: Date
} | null {
  if (!YMD.test(startYmd) || !YMD.test(endYmd)) return null
  const gte = fromZonedTime(`${startYmd}T00:00:00`, timeZone)
  const lt = fromZonedTime(`${addCalendarYmd(endYmd, 1, timeZone)}T00:00:00`, timeZone)
  return { gte, lt }
}

/**
 * Mark all non-extracted punches whose `punchTime` falls in the pay period window (station TZ).
 * Idempotent for rows already extracted. Run inside the same transaction as `PayPeriod` create.
 */
export async function markPunchesExtractedForPayPeriod(
  tx: Prisma.TransactionClient,
  params: {
    payPeriodId: string
    startDate: string
    endDate: string
    extractedAt: Date
    timeZone: string
  }
): Promise<{ count: number }> {
  const bounds = punchTimeStationWindowBounds(params.startDate, params.endDate, params.timeZone)
  if (!bounds) return { count: 0 }
  const r = await tx.attendanceLog.updateMany({
    where: {
      extractedAt: null,
      punchTime: { gte: bounds.gte, lt: bounds.lt }
    },
    data: {
      extractedAt: params.extractedAt,
      extractedPayPeriodId: params.payPeriodId
    }
  })
  return { count: r.count }
}
