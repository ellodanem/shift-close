import type { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLatestFiledPayPeriodForAttendance } from '@/lib/pay-period-archive'
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
 * By default hides “archived” punches for the last filed report: still in the closed
 * window on or before first-save time, unless includeArchived=1 (allowed roles).
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

    const filed = await getLatestFiledPayPeriodForAttendance()
    const applyArchive = Boolean(filed && !includeArchived)

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

    if (applyArchive && filed && /^\d{4}-\d{2}-\d{2}$/.test(filed.endDate)) {
      const closedEndEod = new Date(filed.endDate + 'T23:59:59.999Z')
      if (!Number.isNaN(closedEndEod.getTime())) {
        andParts.push({
          OR: [{ punchTime: { gt: closedEndEod } }, { punchTime: { gt: filed.createdAt } }]
        })
      }
    }

    if (staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { deviceUserId: true }
      })
      if (!staff) {
        return NextResponse.json({
          logs: [],
          archiveCutoffAt: filed?.createdAt.toISOString() ?? null,
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
      archiveCutoffAt: filed?.createdAt.toISOString() ?? null,
      archivedHidden: applyArchive && filed !== null
    })
  } catch (error) {
    console.error('Error fetching attendance logs:', error)
    return NextResponse.json({ error: 'Failed to fetch attendance logs' }, { status: 500 })
  }
}
