import { NextRequest, NextResponse } from 'next/server'
import { attendanceRawLogsEnv } from '@/lib/attendance-raw-mode'
import { openAttendanceWindowAfterLastClosed } from '@/lib/attendance-open-period'
import { prisma } from '@/lib/prisma'
import { calendarYmdInTz, readStationTimeZone } from '@/lib/present-absence'

export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/attendance/pay-period — list saved pay periods (default), or open window after last filed report for Attendance */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('latestSaved') === '1') {
      if (attendanceRawLogsEnv()) {
        return NextResponse.json({
          rawMode: true,
          startDate: null,
          endDate: null,
          openPeriodEndDate: null,
          savedAt: null,
          closedPeriodStart: null,
          closedPeriodEnd: null,
          closedAt: null
        })
      }
      const p = await prisma.payPeriod.findFirst({
        orderBy: { createdAt: 'desc' },
        select: {
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true
        }
      })
      if (!p) {
        return NextResponse.json(null)
      }
      if (!YMD.test(p.startDate) || !YMD.test(p.endDate)) {
        return NextResponse.json({ error: 'Invalid stored pay period dates' }, { status: 500 })
      }
      const tz = await readStationTimeZone()
      const todayYmd = calendarYmdInTz(new Date(), tz)
      const { startDate, endDate, openPeriodEndDate } = openAttendanceWindowAfterLastClosed({
        endDate: p.endDate,
        createdAt: p.createdAt,
        todayYmd
      })
      return NextResponse.json({
        startDate,
        endDate,
        openPeriodEndDate,
        savedAt: p.updatedAt.toISOString(),
        closedPeriodStart: p.startDate,
        closedPeriodEnd: p.endDate,
        closedAt: p.createdAt.toISOString()
      })
    }

    const periods = await prisma.payPeriod.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(periods)
  } catch (error) {
    console.error('Pay period list error:', error)
    return NextResponse.json({ error: 'Failed to list pay periods' }, { status: 500 })
  }
}

/** POST /api/attendance/pay-period - Save a pay period */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { startDate, endDate, reportDate, entityName, rows, notes } = body as {
      startDate?: string
      endDate?: string
      reportDate?: string
      entityName?: string
      notes?: string
      rows?: Array<{ staffId: string; staffName: string; transTtl: number; vacation: string; shortage: number; sickLeaveDays?: number; sickLeaveRanges?: string }>
    }

    if (!startDate || !endDate || !rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: 'startDate, endDate, and rows (array) required' },
        { status: 400 }
      )
    }

    const period = await prisma.payPeriod.create({
      data: {
        startDate,
        endDate,
        reportDate: reportDate || new Date().toISOString().slice(0, 10),
        entityName: entityName || 'Total Auto Service Station',
        rows: JSON.stringify(rows),
        notes: typeof notes === 'string' ? notes : ''
      }
    })

    return NextResponse.json(period, { status: 201 })
  } catch (error) {
    console.error('Pay period save error:', error)
    return NextResponse.json({ error: 'Failed to save pay period' }, { status: 500 })
  }
}
