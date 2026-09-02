import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; drawId: string; winnerId: string } }

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const winner = await prisma.promotionWinner.findFirst({
      where: {
        id: params.winnerId,
        drawId: params.drawId,
        draw: { promotionId: params.id }
      }
    })
    if (!winner) {
      return NextResponse.json({ error: 'Winner not found' }, { status: 404 })
    }
    await prisma.promotionWinner.delete({ where: { id: params.winnerId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting promotion winner:', error)
    return NextResponse.json({ error: 'Failed to delete winner' }, { status: 500 })
  }
}
