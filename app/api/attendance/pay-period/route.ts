import { NextRequest, NextResponse } from 'next/server'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { markPunchesExtractedForPayPeriod } from '@/lib/attendance-extraction'
import { attendanceRawLogsEnv } from '@/lib/attendance-raw-mode'
import { prisma } from '@/lib/prisma'
import { readStationTimeZone } from '@/lib/present-absence'

export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/attendance/pay-period — list saved pay periods (default), or last-filed metadata for Attendance */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('latestSaved') === '1') {
      if (attendanceRawLogsEnv()) {
        return NextResponse.json({
          rawMode: true,
          lastFiledPeriod: null
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
        return NextResponse.json({ rawMode: false, lastFiledPeriod: null })
      }
      if (!YMD.test(p.startDate) || !YMD.test(p.endDate)) {
        return NextResponse.json({ error: 'Invalid stored pay period dates' }, { status: 500 })
      }
      return NextResponse.json({
        rawMode: false,
        lastFiledPeriod: {
          startDate: p.startDate,
          endDate: p.endDate,
          savedAt: p.updatedAt.toISOString(),
          filedAt: p.createdAt.toISOString()
        }
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

/** POST /api/attendance/pay-period - Save a pay period and extract matching punches (station TZ window). */
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

    if (!YMD.test(startDate) || !YMD.test(endDate)) {
      return NextResponse.json({ error: 'startDate and endDate must be YYYY-MM-DD' }, { status: 400 })
    }

    const tz = await readStationTimeZone()
    const extractedAt = new Date()

    const period = await prisma.$transaction(async (tx) => {
      const p = await tx.payPeriod.create({
        data: {
          startDate,
          endDate,
          reportDate: reportDate || businessTodayYmd(),
          entityName: entityName || 'Total Auto Service Station',
          rows: JSON.stringify(rows),
          notes: typeof notes === 'string' ? notes : ''
        }
      })
      await markPunchesExtractedForPayPeriod(tx, {
        payPeriodId: p.id,
        startDate,
        endDate,
        extractedAt,
        timeZone: tz
      })
      return p
    })

    return NextResponse.json(period, { status: 201 })
  } catch (error) {
    console.error('Pay period save error:', error)
    return NextResponse.json({ error: 'Failed to save pay period' }, { status: 500 })
  }
}
