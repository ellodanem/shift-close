import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET ?staffId= — most recent attendance punch for that staff (by staff_id or device_user_id). */
export async function GET(request: NextRequest) {
  try {
    const staffId = request.nextUrl.searchParams.get('staffId')?.trim()
    if (!staffId) {
      return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
    }

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, deviceUserId: true }
    })
    if (!staff) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    }

    const dev = staff.deviceUserId?.trim()
    const last = await prisma.attendanceLog.findFirst({
      where: dev
        ? { OR: [{ staffId: staff.id }, { deviceUserId: dev }] }
        : { staffId: staff.id },
      orderBy: { punchTime: 'desc' },
      select: { punchTime: true, source: true, punchType: true }
    })

    if (!last) {
      return NextResponse.json({ last: null })
    }

    return NextResponse.json({
      last: {
        punchTime: last.punchTime.toISOString(),
        source: last.source,
        punchType: last.punchType
      }
    })
  } catch (e) {
    console.error('last-punch GET', e)
    return NextResponse.json({ error: 'Failed to load last punch' }, { status: 500 })
  }
}
