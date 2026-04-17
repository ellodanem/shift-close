import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findStaffOccupyingSlot, parseExplicitDeviceUserIdInput } from '@/lib/device-user-id'

export const dynamic = 'force-dynamic'

/**
 * POST /api/attendance/device/map-users
 * Saves deviceUserId mappings to staff records in bulk.
 * Body: { mappings: Array<{ staffId: string, deviceUserId: string }> }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mappings: Array<{ staffId: string; deviceUserId: string }> = body.mappings || []

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return NextResponse.json({ error: 'No mappings provided' }, { status: 400 })
    }

    let updated = 0
    for (const { staffId, deviceUserId } of mappings) {
      if (!staffId || !deviceUserId) continue
      const parsed = parseExplicitDeviceUserIdInput(String(deviceUserId).trim())
      if (!parsed.ok) {
        return NextResponse.json({ error: `${parsed.error} (staff ${staffId})` }, { status: 400 })
      }
      const other = await findStaffOccupyingSlot(prisma, parsed.slot, staffId)
      if (other) {
        return NextResponse.json(
          { error: `Device ID ${parsed.normalized} is already in use by another staff member.` },
          { status: 400 }
        )
      }
      await prisma.staff.update({
        where: { id: staffId },
        data: { deviceUserId: parsed.normalized }
      })
      updated++
    }

    return NextResponse.json({ updated })
  } catch (error) {
    console.error('Error mapping users:', error)
    return NextResponse.json({ error: 'Failed to save mappings' }, { status: 500 })
  }
}
