import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET /api/attendance/logs?startDate=...&endDate=...&staffId=...
 * Returns attendance logs with staff info, plus irregularity flags.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const staffId = searchParams.get('staffId')

    const where: Record<string, unknown> = {}

    if (startDate && endDate) {
      where.punchTime = {
        gte: new Date(startDate + 'T00:00:00'),
        lte: new Date(endDate + 'T23:59:59.999')
      }
    } else if (startDate) {
      where.punchTime = { gte: new Date(startDate + 'T00:00:00') }
    } else if (endDate) {
      where.punchTime = { lte: new Date(endDate + 'T23:59:59.999') }
    }

    if (staffId) {
      where.staffId = staffId
    }

    const logs = await prisma.attendanceLog.findMany({
      where,
      include: { staff: { select: { id: true, name: true } } },
      orderBy: { punchTime: 'asc' }
    })

    // Compute irregularities: in without out, out without in
    const byStaffDate = new Map<string, Array<{ id: string; punchTime: Date; punchType: string }>>()
    for (const log of logs) {
      const key = `${log.staffId || log.deviceUserId}|${log.punchTime.toISOString().slice(0, 10)}`
      if (!byStaffDate.has(key)) byStaffDate.set(key, [])
      byStaffDate.get(key)!.push({
        id: log.id,
        punchTime: log.punchTime,
        punchType: log.punchType
      })
    }

    const irregularityIds = new Set<string>()
    for (const arr of byStaffDate.values()) {
      arr.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i]
        if (p.punchType === 'in') {
          const nextOut = arr.slice(i + 1).find((x) => x.punchType === 'out')
          if (!nextOut) irregularityIds.add(p.id) // in without out
        } else {
          const prevIn = arr.slice(0, i).find((x) => x.punchType === 'in')
          if (!prevIn) irregularityIds.add(p.id) // out without in
        }
      }
    }

    const logsWithIrregularity = logs.map((log) => ({
      ...log,
      hasIrregularity: irregularityIds.has(log.id)
    }))

    return NextResponse.json(logsWithIrregularity)
  } catch (error) {
    console.error('Error fetching attendance logs:', error)
    return NextResponse.json({ error: 'Failed to fetch attendance logs' }, { status: 500 })
  }
}
