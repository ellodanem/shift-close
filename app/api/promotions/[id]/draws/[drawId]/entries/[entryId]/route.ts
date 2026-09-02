import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; drawId: string; entryId: string } }

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const entry = await prisma.promotionEntry.findFirst({
      where: {
        id: params.entryId,
        drawId: params.drawId,
        draw: { promotionId: params.id }
      }
    })
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }
    await prisma.promotionEntry.delete({ where: { id: params.entryId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting promotion entry:', error)
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
}
