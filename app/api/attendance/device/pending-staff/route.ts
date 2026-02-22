import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/attendance/device/pending-staff
 * Returns all active staff for the agent to sync to the ZKTeco device.
 * Agent compares this list against device users and pushes any missing/updated ones.
 * Protected by AGENT_SECRET header.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-agent-secret')
  const expectedSecret = process.env.AGENT_SECRET

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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

    return NextResponse.json({ staff: mapped, total: mapped.length })
  } catch (error) {
    console.error('Error fetching pending staff:', error)
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
  }
}
