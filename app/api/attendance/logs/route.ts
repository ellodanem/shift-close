import type { Prisma } from '@prisma/client'
import { fromZonedTime } from 'date-fns-tz'
import { NextRequest, NextResponse } from 'next/server'
import { expandDeviceUserIdsForDbMatch } from '@/lib/device-user-id'
import { prisma } from '@/lib/prisma'
import { addCalendarYmd, readStationTimeZone } from '@/lib/present-absence'
import { attendanceRawLogsEnv } from '@/lib/attendance-raw-mode'
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

/** GET /api/attendance/logs?startDate=&endDate=&staffId=&includeExtracted=1
 * Default: only punches not yet “extracted” (filed in a saved Pay Period Report).
 * includeExtracted=1 (admin/manager/operations_manager): also return extracted rows.
 * includeArchived=1 is accepted as an alias for includeExtracted (legacy).
 * ATTENDANCE_RAW_LOGS env: no extraction filter (all rows).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const staffId = searchParams.get('staffId')
    const includeExtractedParam =
      searchParams.get('includeExtracted') === '1' || searchParams.get('includeArchived') === '1'

    const session = await getSessionFromRequest(request)
    const includeExtracted =
      includeExtractedParam && session !== null && canViewArchivedAttendanceLogs(session.role)

    const hideExtracted = !attendanceRawLogsEnv() && !includeExtracted

    const andParts: Prisma.AttendanceLogWhereInput[] = []

    const ymd = /^\d{4}-\d{2}-\d{2}$/
    const tz = await readStationTimeZone()

    if (startDate && endDate) {
      if (ymd.test(startDate) && ymd.test(endDate)) {
        const gte = fromZonedTime(`${startDate}T00:00:00`, tz)
        const endExclusive = fromZonedTime(`${addCalendarYmd(endDate, 1, tz)}T00:00:00`, tz)
        andParts.push({ punchTime: { gte, lt: endExclusive } })
      } else {
        andParts.push({
          punchTime: {
            gte: new Date(startDate + 'T00:00:00'),
            lte: new Date(endDate + 'T23:59:59.999')
          }
        })
      }
    } else if (startDate) {
      if (ymd.test(startDate)) {
        andParts.push({ punchTime: { gte: fromZonedTime(`${startDate}T00:00:00`, tz) } })
      } else {
        andParts.push({
          punchTime: { gte: new Date(startDate + 'T00:00:00') }
        })
      }
    } else if (endDate) {
      if (ymd.test(endDate)) {
        const endExclusive = fromZonedTime(`${addCalendarYmd(endDate, 1, tz)}T00:00:00`, tz)
        andParts.push({ punchTime: { lt: endExclusive } })
      } else {
        andParts.push({
          punchTime: { lte: new Date(endDate + 'T23:59:59.999') }
        })
      }
    }

    if (hideExtracted) {
      andParts.push({ extractedAt: null })
    }

    if (staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { deviceUserId: true }
      })
      if (!staff) {
        return NextResponse.json({
          logs: [],
          extractedHidden: hideExtracted,
          rawLogsMode: attendanceRawLogsEnv()
        })
      }
      const dev = staff.deviceUserId?.trim()
      if (dev) {
        const devKeys = expandDeviceUserIdsForDbMatch([dev])
        andParts.push({ OR: [{ staffId }, { deviceUserId: { in: devKeys } }] })
      } else {
        andParts.push({ staffId })
      }
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
      extractedHidden: hideExtracted,
      rawLogsMode: attendanceRawLogsEnv()
    })
  } catch (error) {
    console.error('Error fetching attendance logs:', error)
    return NextResponse.json({ error: 'Failed to fetch attendance logs' }, { status: 500 })
  }
}
