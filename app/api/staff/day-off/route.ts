import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TIME_OFF_LIST_ROW_CAP, validateTimeOffDateRange } from '@/lib/time-off-range'

export const dynamic = 'force-dynamic'

// List day-off records in a date range (prefer GET /api/time-off/bundle for the Time Off page).

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = validateTimeOffDateRange(
      searchParams.get('startDate'),
      searchParams.get('endDate')
    )
    if ('error' in range) {
      return NextResponse.json({ error: range.error }, { status: range.status })
    }

    const records = await prisma.staffDayOff.findMany({
      where: { date: { gte: range.startDate, lte: range.endDate } },
      include: {
        staff: { select: { id: true, name: true, firstName: true, lastName: true } }
      },
      orderBy: [{ date: 'desc' }, { staffId: 'asc' }],
      take: TIME_OFF_LIST_ROW_CAP
    })

    return NextResponse.json(
      records.map((r) => ({
        id: r.id,
        staffId: r.staffId,
        staffName: r.staff.name,
        staffFirstName: r.staff.firstName,
        date: r.date,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString()
      }))
    )
  } catch (error) {
    console.error('Error fetching day off records:', error)
    return NextResponse.json(
      { error: 'Failed to fetch day off records' },
      { status: 500 }
    )
  }
}

