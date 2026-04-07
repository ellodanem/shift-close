import type { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLatestSavedPayPeriodCutoffInstant } from '@/lib/pay-period-archive'
import { canViewArchivedAttendanceLogs } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'

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

/** GET /api/attendance/logs?startDate=...&endDate=...&staffId=...&includeArchived=1
 * Raw logs from DB. By default hides punches at or before the latest saved pay period close (saved-at instant).
 * Admin/manager/operations_manager may pass includeArchived=1 to load full history in range.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const staffId = searchParams.get('staffId')
    const includeArchivedParam = searchParams.get('includeArchived') === '1'

    const session = await getSessionFromRequest(request)
    const includeArchived =
      includeArchivedParam && session !== null && canViewArchivedAttendanceLogs(session.role)

    const cutoff = await getLatestSavedPayPeriodCutoffInstant()
    const applyArchive = Boolean(cutoff && !includeArchived)

    const andParts: Prisma.AttendanceLogWhereInput[] = []

    if (startDate && endDate) {
      andParts.push({
        punchTime: {
          gte: new Date(startDate + 'T00:00:00'),
          lte: new Date(endDate + 'T23:59:59.999')
        }
      })
    } else if (startDate) {
      andParts.push({
        punchTime: { gte: new Date(startDate + 'T00:00:00') }
      })
    } else if (endDate) {
      andParts.push({
        punchTime: { lte: new Date(endDate + 'T23:59:59.999') }
      })
    }

    if (applyArchive && cutoff) {
      andParts.push({ punchTime: { gt: cutoff } })
    }

    if (staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { deviceUserId: true }
      })
      if (!staff) {
        return NextResponse.json({
          logs: [],
          archiveCutoffAt: cutoff?.toISOString() ?? null,
          archivedHidden: false
        })
      }
      const dev = staff.deviceUserId?.trim()
      andParts.push(dev ? { OR: [{ staffId }, { deviceUserId: dev }] } : { staffId })
    }

    const where: Prisma.AttendanceLogWhereInput =
      andParts.length === 0
        ? {}
        : andParts.length === 1
          ? (andParts[0] as Prisma.AttendanceLogWhereInput)
          : { AND: andParts }

    const logs = await prisma.attendanceLog.findMany({
      where,
      include: { staff: { select: { id: true, name: true } } },
      orderBy: { punchTime: 'asc' }
    })

    return NextResponse.json({
      logs,
      archiveCutoffAt: cutoff?.toISOString() ?? null,
      archivedHidden: applyArchive && cutoff !== null
    })
  } catch (error) {
    console.error('Error fetching attendance logs:', error)
    return NextResponse.json({ error: 'Failed to fetch attendance logs' }, { status: 500 })
  }
}
