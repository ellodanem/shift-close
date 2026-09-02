import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

const YMD = /^\d{4}-\d{2}-\d{2}$/

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const promotion = await prisma.promotion.findUnique({ where: { id: params.id } })
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }

    const body = await request.json()
    const drawDate = typeof body.drawDate === 'string' ? body.drawDate.trim() : ''
    if (!YMD.test(drawDate)) {
      return NextResponse.json({ error: 'drawDate must be YYYY-MM-DD' }, { status: 400 })
    }
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

    const draw = await prisma.promotionDraw.create({
      data: {
        promotionId: params.id,
        drawDate,
        notes
      },
      include: {
        winners: {
          orderBy: { createdAt: 'asc' },
          include: { staff: { select: { id: true, name: true } } }
        }
      }
    })
    return NextResponse.json(draw, { status: 201 })
  } catch (error) {
    console.error('Error creating promotion draw:', error)
    return NextResponse.json({ error: 'Failed to create draw' }, { status: 500 })
  }
}
