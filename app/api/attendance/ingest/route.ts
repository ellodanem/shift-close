import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/attendance/ingest
 * Receives attendance logs pushed from the local Windows/Pi agent (backup polling).
 * Protected by AGENT_SECRET header.
 *
 * Body: { logs: Array<{ deviceUserId, recordTime, state? }> }
 */
export async function POST(request: NextRequest) {
  // Validate agent secret
  const secret = request.headers.get('x-agent-secret')
  const expectedSecret = process.env.AGENT_SECRET

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const logs: Array<{ deviceUserId: string; recordTime: string; state?: number }> = body.logs || []

    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No logs provided' })
    }

    // Build staff lookup
    const allStaff = await prisma.staff.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, deviceUserId: true }
    })
    const staffMap = new Map<string, { id: string; name: string }>()
    for (const s of allStaff) {
      if (s.deviceUserId) staffMap.set(s.deviceUserId.trim(), { id: s.id, name: s.name })
    }

    // Group by user/day for in/out inference
    const byUserDay = new Map<string, Array<{ deviceUserId: string; punchTime: Date }>>()
    const parsed: Array<{ deviceUserId: string; punchTime: Date; state?: number }> = []

    for (const log of logs) {
      const deviceUserId = String(log.deviceUserId || '').trim()
      if (!deviceUserId) continue
      const punchTime = new Date(log.recordTime)
      if (isNaN(punchTime.getTime())) continue

      parsed.push({ deviceUserId, punchTime, state: log.state })
      const dayKey = `${deviceUserId}|${punchTime.toISOString().slice(0, 10)}`
      if (!byUserDay.has(dayKey)) byUserDay.set(dayKey, [])
      byUserDay.get(dayKey)!.push({ deviceUserId, punchTime })
    }

    for (const arr of byUserDay.values()) {
      arr.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
    }

    let created = 0
    for (const { deviceUserId, punchTime, state } of parsed) {
      let punchType: string
      if (state === 0 || state === 4) {
        punchType = 'in'
      } else if (state === 1 || state === 5) {
        punchType = 'out'
      } else {
        const dayKey = `${deviceUserId}|${punchTime.toISOString().slice(0, 10)}`
        const dayPunches = byUserDay.get(dayKey) || []
        const idx = dayPunches.findIndex(
          (p) => Math.abs(p.punchTime.getTime() - punchTime.getTime()) < 1000
        )
        punchType = idx % 2 === 0 ? 'in' : 'out'
      }

      const existing = await prisma.attendanceLog.findFirst({
        where: {
          deviceUserId,
          punchTime: {
            gte: new Date(punchTime.getTime() - 1000),
            lte: new Date(punchTime.getTime() + 1000)
          }
        }
      })
      if (existing) continue

      const staffMatch = staffMap.get(deviceUserId)
      await prisma.attendanceLog.create({
        data: {
          staffId: staffMatch?.id ?? null,
          deviceUserId,
          deviceUserName: staffMatch?.name ?? null,
          punchTime,
          punchType,
          source: 'agent'
        }
      })
      created++
    }

    return NextResponse.json({ synced: created, total: parsed.length })
  } catch (error) {
    console.error('Ingest error:', error)
    return NextResponse.json({ error: 'Failed to ingest logs' }, { status: 500 })
  }
}
