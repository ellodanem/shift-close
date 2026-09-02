import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  entryDedupeKey,
  existingEntryKeys,
  loadActiveStaffIndex,
  matchStaffByName,
  normalizeEntrantKey
} from '@/lib/promotion-entries'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; drawId: string } }

async function findDraw(promotionId: string, drawId: string) {
  return prisma.promotionDraw.findFirst({
    where: { id: drawId, promotionId }
  })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const draw = await findDraw(params.id, params.drawId)
    if (!draw) {
      return NextResponse.json({ error: 'Draw not found' }, { status: 404 })
    }

    const body = await request.json()
    let staffId: string | null =
      typeof body.staffId === 'string' && body.staffId.trim() ? body.staffId.trim() : null
    let entrantName = typeof body.entrantName === 'string' ? body.entrantName.trim() : ''

    if (staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { id: true, name: true }
      })
      if (!staff) {
        return NextResponse.json({ error: 'Staff not found' }, { status: 400 })
      }
      if (!entrantName) entrantName = staff.name
    } else if (entrantName) {
      const index = await loadActiveStaffIndex()
      const matched = matchStaffByName(entrantName, index)
      if (matched) staffId = matched.id
    }

    if (!entrantName) {
      return NextResponse.json(
        { error: 'entrantName or staffId is required' },
        { status: 400 }
      )
    }

    const keys = await existingEntryKeys(params.drawId)
    const dedupe = entryDedupeKey(staffId, entrantName)
    if (keys.has(dedupe) || keys.has(`name:${normalizeEntrantKey(entrantName)}`)) {
      return NextResponse.json(
        { error: 'This person is already entered for this draw' },
        { status: 409 }
      )
    }

    const entry = await prisma.promotionEntry.create({
      data: {
        drawId: params.drawId,
        staffId,
        entrantName
      },
      include: { staff: { select: { id: true, name: true } } }
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error adding promotion entry:', error)
    return NextResponse.json({ error: 'Failed to add entry' }, { status: 500 })
  }
}
