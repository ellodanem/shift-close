import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const punchSelect = {
  id: true,
  punchTime: true,
  punchType: true,
  source: true,
  createdAt: true
} as const

function serialize(
  p: { id: string; punchTime: Date; punchType: string; source: string; createdAt: Date } | null
) {
  if (!p) return null
  return {
    id: p.id,
    punchTime: p.punchTime.toISOString(),
    punchType: p.punchType,
    source: p.source,
    createdAt: p.createdAt.toISOString()
  }
}

/**
 * GET ?staffId=
 * - lastByTime: latest punch by clock time (for next In/Out default).
 * - lastSavedManual: latest manual punch by row createdAt (for data-entry “where was I”).
 */
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
    const whereBase = dev
      ? { OR: [{ staffId: staff.id }, { deviceUserId: dev }] }
      : { staffId: staff.id }

    const [lastByTime, lastSavedManual] = await Promise.all([
      prisma.attendanceLog.findFirst({
        where: whereBase,
        orderBy: { punchTime: 'desc' },
        select: punchSelect
      }),
      prisma.attendanceLog.findFirst({
        where: { ...whereBase, source: 'manual' },
        orderBy: { createdAt: 'desc' },
        select: punchSelect
      })
    ])

    const byTime = serialize(lastByTime)
    const saved = serialize(lastSavedManual)

    return NextResponse.json({
      lastByTime: byTime,
      lastSavedManual: saved,
      /** @deprecated use lastByTime */
      last: byTime
    })
  } catch (e) {
    console.error('last-punch GET', e)
    return NextResponse.json({ error: 'Failed to load last punch' }, { status: 500 })
  }
}
