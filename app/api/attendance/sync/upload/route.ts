import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type UploadLog = {
  deviceUserId: string
  recordTime: string
  state?: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const logs: UploadLog[] = Array.isArray(body?.logs) ? body.logs : []
    if (logs.length === 0) {
      return NextResponse.json({ error: 'No punches selected' }, { status: 400 })
    }

    const allStaff = await prisma.staff.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, deviceUserId: true }
    })
    const staffMap = new Map<string, { id: string; name: string }>()
    for (const s of allStaff) {
      if (s.deviceUserId) staffMap.set(s.deviceUserId.trim(), { id: s.id, name: s.name })
    }

    const byUserDay = new Map<string, Array<{ punchTime: Date }>>()
    const parsed: Array<{ deviceUserId: string; punchTime: Date; state?: number }> = []
    const seen = new Set<string>()
    for (const log of logs) {
      const deviceUserId = String(log.deviceUserId || '').trim()
      if (!deviceUserId) continue
      const punchTime = new Date(log.recordTime)
      if (Number.isNaN(punchTime.getTime())) continue
      const dedupe = `${deviceUserId}|${punchTime.getTime()}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      parsed.push({ deviceUserId, punchTime, state: log.state })
      const dayKey = `${deviceUserId}|${punchTime.toISOString().slice(0, 10)}`
      if (!byUserDay.has(dayKey)) byUserDay.set(dayKey, [])
      byUserDay.get(dayKey)!.push({ punchTime })
    }

    for (const arr of byUserDay.values()) {
      arr.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
    }

    let created = 0
    for (const { deviceUserId, punchTime, state } of parsed) {
      let punchType: 'in' | 'out'
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
          source: 'zkteco'
        }
      })
      created++
    }

    return NextResponse.json({ synced: created, total: parsed.length })
  } catch (error) {
    console.error('Attendance sync upload error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to upload selected punches'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
