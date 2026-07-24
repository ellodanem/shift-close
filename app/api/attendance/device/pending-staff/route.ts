import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Build a weak fingerprint for active staff that have a deviceUserId.
 * Cheap aggregate avoids a full findMany when the agent sends If-None-Match.
 */
async function staffDeviceFingerprint(): Promise<string> {
  const agg = await prisma.staff.aggregate({
    where: {
      status: 'active',
      deviceUserId: { not: null }
    },
    _count: { id: true },
    _max: { updatedAt: true }
  })
  const count = agg._count.id
  const maxMs = agg._max.updatedAt?.getTime() ?? 0
  return `W/"staff-device-${count}-${maxMs}"`
}

/**
 * GET /api/attendance/device/pending-staff
 * Returns all active staff for the agent to sync to the ZKTeco device.
 * Agent compares this list against device users and pushes any missing/updated ones.
 * Protected by AGENT_SECRET header.
 * Supports If-None-Match / 304 when the staff-device fingerprint is unchanged.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-agent-secret')
  const expectedSecret = process.env.AGENT_SECRET

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const etag = await staffDeviceFingerprint()
    const ifNoneMatch = request.headers.get('if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-cache'
        }
      })
    }

    const staff = await prisma.staff.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        deviceUserId: true
      },
      orderBy: { name: 'asc' }
    })

    // Only return staff that have a deviceUserId assigned
    // Agent uses this to know who should exist on the device
    const mapped = staff
      .filter((s) => s.deviceUserId)
      .map((s) => ({
        id: s.id,
        name: s.name,
        firstName: s.firstName,
        lastName: s.lastName,
        deviceUserId: s.deviceUserId!
      }))

    return NextResponse.json(
      { staff: mapped, total: mapped.length },
      {
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-cache'
        }
      }
    )
  } catch (error) {
    console.error('Error fetching pending staff:', error)
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
  }
}
