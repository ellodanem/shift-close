import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; drawId: string } }

const YMD = /^\d{4}-\d{2}-\d{2}$/

async function findDraw(promotionId: string, drawId: string) {
  return prisma.promotionDraw.findFirst({
    where: { id: drawId, promotionId }
  })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const existing = await findDraw(params.id, params.drawId)
    if (!existing) {
      return NextResponse.json({ error: 'Draw not found' }, { status: 404 })
    }

    const body = await request.json()
    const data: { drawDate?: string; notes?: string } = {}

    if (typeof body.drawDate === 'string') {
      const drawDate = body.drawDate.trim()
      if (!YMD.test(drawDate)) {
        return NextResponse.json({ error: 'drawDate must be YYYY-MM-DD' }, { status: 400 })
      }
      data.drawDate = drawDate
    }
    if (typeof body.notes === 'string') data.notes = body.notes.trim()

    const draw = await prisma.promotionDraw.update({
      where: { id: params.drawId },
      data,
      include: {
        winners: {
          orderBy: { createdAt: 'asc' },
          include: { staff: { select: { id: true, name: true } } }
        }
      }
    })
    return NextResponse.json(draw)
  } catch (error) {
    console.error('Error updating promotion draw:', error)
    return NextResponse.json({ error: 'Failed to update draw' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const existing = await findDraw(params.id, params.drawId)
    if (!existing) {
      return NextResponse.json({ error: 'Draw not found' }, { status: 404 })
    }
    await prisma.promotionDraw.delete({ where: { id: params.drawId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting promotion draw:', error)
    return NextResponse.json({ error: 'Failed to delete draw' }, { status: 500 })
  }
}
