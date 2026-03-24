import type { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** POST /api/attendance/logs — add a manual punch (missed clock-in/out). Body: staffId, punchTime (ISO), punchType in|out */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { staffId, punchTime, punchType } = body as {
      staffId?: string
      punchTime?: string
      punchType?: string
    }

    if (!staffId || typeof staffId !== 'string') {
      return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
    }

    const pt = String(punchType ?? '')
      .toLowerCase()
      .trim()
    if (pt !== 'in' && pt !== 'out') {
      return NextResponse.json({ error: 'punchType must be in or out' }, { status: 400 })
    }

    if (!punchTime || !String(punchTime).trim()) {
      return NextResponse.json({ error: 'punchTime is required' }, { status: 400 })
    }

    const t = new Date(punchTime)
    if (isNaN(t.getTime())) {
      return NextResponse.json({ error: 'Invalid punchTime' }, { status: 400 })
    }

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, name: true, deviceUserId: true }
    })
    if (!staff) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    }
    if (!staff.deviceUserId?.trim()) {
      return NextResponse.json(
        { error: 'Staff has no device user ID — map them on Device Management first' },
        { status: 400 }
      )
    }

    const duplicate = await prisma.attendanceLog.findFirst({
      where: {
        deviceUserId: staff.deviceUserId,
        punchTime: {
          gte: new Date(t.getTime() - 1000),
          lte: new Date(t.getTime() + 1000)
        }
      }
    })
    if (duplicate) {
      return NextResponse.json(
        { error: 'A punch already exists within 1 second of this time' },
        { status: 409 }
      )
    }

    const log = await prisma.attendanceLog.create({
      data: {
        staffId: staff.id,
        deviceUserId: staff.deviceUserId,
        deviceUserName: staff.name,
        punchTime: t,
        punchType: pt,
        source: 'manual'
      },
      include: { staff: { select: { id: true, name: true } } }
    })

    return NextResponse.json(log)
  } catch (error) {
    console.error('Attendance log POST error:', error)
    return NextResponse.json({ error: 'Failed to create log' }, { status: 500 })
  }
}

/** GET /api/attendance/logs?startDate=...&endDate=...&staffId=...
 * Returns attendance logs with staff info, plus irregularity flags (sequential In/Out pairing).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const staffId = searchParams.get('staffId')

    const where: Prisma.AttendanceLogWhereInput = {}

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
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { deviceUserId: true }
      })
      if (!staff) {
        where.id = { in: [] }
      } else {
        const dev = staff.deviceUserId?.trim()
        where.OR = dev ? [{ staffId }, { deviceUserId: dev }] : [{ staffId }]
      }
    }

    const logs = await prisma.attendanceLog.findMany({
      where,
      include: { staff: { select: { id: true, name: true } } },
      orderBy: { punchTime: 'asc' }
    })

    // Irregularities: sequential In/Out pairing per staff per calendar day.
    // Each Out closes the most recent unmatched In; an Out with none open is irregular.
    // Any In still unmatched after the last punch is irregular (no closing Out).
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
      const openInIds: string[] = []
      for (const p of arr) {
        if (p.punchType === 'in') {
          openInIds.push(p.id)
        } else if (openInIds.length === 0) {
          irregularityIds.add(p.id)
        } else {
          openInIds.pop()
        }
      }
      for (const id of openInIds) {
        irregularityIds.add(id)
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
