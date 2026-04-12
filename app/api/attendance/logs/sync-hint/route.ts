import { NextResponse } from 'next/server'
import { attendanceRawLogsEnv } from '@/lib/attendance-raw-mode'
import { prisma } from '@/lib/prisma'
import { calendarYmdInTz, readStationTimeZone } from '@/lib/present-absence'

export const dynamic = 'force-dynamic'

/**
 * Tiny payload for polling: detect new punches, corrections, station “today” rollover,
 * pay-period changes, or raw-mode env toggles without loading the full log list.
 */
export async function GET() {
  try {
    const [newestCreated, newestNonExtractedCreated, newestCorrected, payPeriod, tz] =
      await Promise.all([
        prisma.attendanceLog.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        }),
        prisma.attendanceLog.findFirst({
          where: { extractedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        }),
        prisma.attendanceLog.findFirst({
          where: { correctedAt: { not: null } },
          orderBy: { correctedAt: 'desc' },
          select: { correctedAt: true }
        }),
        prisma.payPeriod.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { id: true, updatedAt: true }
        }),
        readStationTimeZone()
      ])

    const stationTodayYmd = calendarYmdInTz(new Date(), tz)
    const payPeriodTick = payPeriod
      ? `${payPeriod.id}:${payPeriod.updatedAt.toISOString()}`
      : 'none'

    return NextResponse.json({
      newestCreatedAt: newestCreated?.createdAt.toISOString() ?? null,
      newestNonExtractedCreatedAt: newestNonExtractedCreated?.createdAt.toISOString() ?? null,
      newestCorrectedAt: newestCorrected?.correctedAt?.toISOString() ?? null,
      stationTodayYmd,
      payPeriodTick,
      rawLogsMode: attendanceRawLogsEnv()
    })
  } catch (error) {
    console.error('Attendance sync-hint error:', error)
    return NextResponse.json({ error: 'Failed to load sync hint' }, { status: 500 })
  }
}
