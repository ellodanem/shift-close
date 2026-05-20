import { Prisma } from '@prisma/client'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { attendanceRawLogsEnv } from '@/lib/attendance-raw-mode'
import { prisma } from '@/lib/prisma'

type SyncHintAggRow = {
  newest_created: Date | null
  newest_non_extracted: Date | null
  newest_corrected: Date | null
}

/** Lightweight fingerprint for attendance polling (one log aggregate + pay period). */
export async function buildAttendanceSyncHint() {
  const [aggRows, payPeriod] = await Promise.all([
    prisma.$queryRaw<SyncHintAggRow[]>(Prisma.sql`
      SELECT
        MAX(created_at) AS newest_created,
        MAX(CASE WHEN extracted_at IS NULL THEN created_at END) AS newest_non_extracted,
        MAX(corrected_at) AS newest_corrected
      FROM attendance_logs
    `),
    prisma.payPeriod.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, updatedAt: true }
    })
  ])

  const agg = aggRows[0]
  const payPeriodTick = payPeriod
    ? `${payPeriod.id}:${payPeriod.updatedAt.toISOString()}`
    : 'none'

  return {
    newestCreatedAt: agg?.newest_created?.toISOString() ?? null,
    newestNonExtractedCreatedAt: agg?.newest_non_extracted?.toISOString() ?? null,
    newestCorrectedAt: agg?.newest_corrected?.toISOString() ?? null,
    stationTodayYmd: businessTodayYmd(),
    payPeriodTick,
    rawLogsMode: attendanceRawLogsEnv()
  }
}
