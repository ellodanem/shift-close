import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// List all day-off records in a date range (used by roster)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {}
    if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate }
    } else if (startDate) {
      where.date = { gte: startDate }
    } else if (endDate) {
      where.date = { lte: endDate }
    }

    const records = await prisma.staffDayOff.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, firstName: true, lastName: true } }
      },
      orderBy: [{ date: 'desc' }, { staffId: 'asc' }]
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

