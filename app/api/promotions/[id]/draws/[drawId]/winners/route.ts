import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; drawId: string } }

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const draw = await prisma.promotionDraw.findFirst({
      where: { id: params.drawId, promotionId: params.id }
    })
    if (!draw) {
      return NextResponse.json({ error: 'Draw not found' }, { status: 404 })
    }

    const body = await request.json()
    let staffId: string | null =
      typeof body.staffId === 'string' && body.staffId.trim() ? body.staffId.trim() : null
    let winnerName = typeof body.winnerName === 'string' ? body.winnerName.trim() : ''
    const prizeNotes = typeof body.prizeNotes === 'string' ? body.prizeNotes.trim() : ''

    if (staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { id: true, name: true }
      })
      if (!staff) {
        return NextResponse.json({ error: 'Staff not found' }, { status: 400 })
      }
      if (!winnerName) winnerName = staff.name
    }

    if (!winnerName) {
      return NextResponse.json(
        { error: 'winnerName or staffId is required' },
        { status: 400 }
      )
    }

    const winner = await prisma.promotionWinner.create({
      data: {
        drawId: params.drawId,
        staffId,
        winnerName,
        prizeNotes
      },
      include: { staff: { select: { id: true, name: true } } }
    })
    return NextResponse.json(winner, { status: 201 })
  } catch (error) {
    console.error('Error adding promotion winner:', error)
    return NextResponse.json({ error: 'Failed to add winner' }, { status: 500 })
  }
}
