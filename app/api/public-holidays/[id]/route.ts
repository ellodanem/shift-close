import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { isFullAccessRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

/** PATCH — toggle stationClosed (admin/manager only) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request)
  if (!session || !isFullAccessRole(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const stationClosed =
      typeof body.stationClosed === 'boolean' ? body.stationClosed : undefined

    if (stationClosed === undefined) {
      return NextResponse.json({ error: 'stationClosed (boolean) is required' }, { status: 400 })
    }

    const updated = await prisma.publicHoliday.update({
      where: { id },
      data: { stationClosed }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating public holiday:', error)
    return NextResponse.json({ error: 'Failed to update public holiday' }, { status: 500 })
  }
}
