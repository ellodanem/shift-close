import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// List all sick-leave records in a date range (used by roster)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: {
      endDate?: { gte: string }
      startDate?: { lte: string }
    } = {}

    if (startDate) {
      where.endDate = { gte: startDate }
    }
    if (endDate) {
      where.startDate = { lte: endDate }
    }

    const records = await prisma.staffSickLeave.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, firstName: true, lastName: true } },
        documents: { select: { id: true, fileName: true, fileUrl: true } }
      },
      orderBy: [{ startDate: 'desc' }, { staffId: 'asc' }]
    })

    return NextResponse.json(
      records.map((r) => ({
        id: r.id,
        staffId: r.staffId,
        staffName: r.staff.name,
        staffFirstName: r.staff.firstName,
        startDate: r.startDate,
        endDate: r.endDate,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        documents: r.documents
      }))
    )
  } catch (error) {
    console.error('Error fetching sick leave records:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sick leave records' },
      { status: 500 }
    )
  }
}

