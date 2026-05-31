import { NextRequest, NextResponse } from 'next/server'
import { normalizeCallOutDate } from '@/lib/call-outs'
import { formatAppUserDisplayName } from '@/lib/roles'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET ?startDate=&endDate= — call outs in range with staff names. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = normalizeCallOutDate(searchParams.get('startDate') ?? '')
    const endDate = normalizeCallOutDate(searchParams.get('endDate') ?? '')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate (YYYY-MM-DD) are required' },
        { status: 400 }
      )
    }

    const rows = await prisma.staffCallOut.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: {
        staff: { select: { id: true, name: true, firstName: true, lastName: true } },
        recordedBy: {
          select: { id: true, username: true, firstName: true, lastName: true }
        }
      },
      orderBy: [{ date: 'desc' }, { calledAt: 'desc' }]
    })

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        staffId: r.staffId,
        staffName: r.staff.name,
        staffFirstName: r.staff.firstName,
        date: r.date,
        calledAt: r.calledAt.toISOString(),
        notes: r.notes,
        recordedByUserId: r.recordedByUserId,
        recordedByLabel: r.recordedBy ? formatAppUserDisplayName(r.recordedBy) : null
      }))
    )
  } catch (error) {
    console.error('Error fetching call outs:', error)
    return NextResponse.json({ error: 'Failed to fetch call outs' }, { status: 500 })
  }
}
