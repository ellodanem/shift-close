import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
      await prisma.staff.update({
        where: { id: staffId },
        data: { deviceUserId: deviceUserId.trim() }
      })
      updated++
    }

    return NextResponse.json({ updated })
  } catch (error) {
    console.error('Error mapping users:', error)
    return NextResponse.json({ error: 'Failed to save mappings' }, { status: 500 })
  }
}
