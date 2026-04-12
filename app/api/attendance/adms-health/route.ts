import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * GET /api/attendance/adms-health
 * Summarizes punches stored from ZKTeco ADMS push (source adms:*) for quick troubleshooting.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const ms24h = 24 * 60 * 60 * 1000
  const ms7d = 7 * ms24h
  const since24h = new Date(now.getTime() - ms24h)
  const since7d = new Date(now.getTime() - ms7d)

  try {
    const [
      totalAdmsPunches,
      unmappedCount,
      last24hCount,
      last7dCount,
      manualTotal,
      bySource,
      latest
    ] = await Promise.all([
      prisma.attendanceLog.count({ where: { source: { startsWith: 'adms:' } } }),
      prisma.attendanceLog.count({
        where: { source: { startsWith: 'adms:' }, staffId: null }
      }),
      prisma.attendanceLog.count({
        where: { source: { startsWith: 'adms:' }, createdAt: { gte: since24h } }
      }),
      prisma.attendanceLog.count({
        where: { source: { startsWith: 'adms:' }, createdAt: { gte: since7d } }
      }),
      prisma.attendanceLog.count({ where: { source: 'manual' } }),
      prisma.attendanceLog.groupBy({
        by: ['source'],
        where: { source: { startsWith: 'adms:' } },
        _count: { _all: true }
      }),
      prisma.attendanceLog.findFirst({
        where: { source: { startsWith: 'adms:' } },
        orderBy: { createdAt: 'desc' },
        include: { staff: { select: { name: true } } }
      })
    ])

    const serials = bySource
      .map((r) => r.source.replace(/^adms:/i, ''))
      .filter(Boolean)

    const latestOut = latest
      ? {
          punchTime: latest.punchTime.toISOString(),
          createdAt: latest.createdAt.toISOString(),
          deviceUserId: latest.deviceUserId,
          punchType: latest.punchType,
          source: latest.source,
          staffName: latest.staff?.name ?? latest.deviceUserName ?? null,
          staffId: latest.staffId
        }
      : null

    return NextResponse.json({
      totalAdmsPunches,
      unmappedCount,
      last24hCount,
      last7dCount,
      manualTotal,
      distinctSerials: [...new Set(serials)],
      latest: latestOut
    })
  } catch (e) {
    console.error('adms-health GET', e)
    return NextResponse.json({ error: 'Failed to load ADMS health' }, { status: 500 })
  }
}
