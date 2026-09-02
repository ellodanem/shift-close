import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isPromotionStatus, promotionDetailInclude } from '@/lib/promotions'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: params.id },
      include: promotionDetailInclude
    })
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }
    return NextResponse.json(promotion)
  } catch (error) {
    console.error('Error fetching promotion:', error)
    return NextResponse.json({ error: 'Failed to fetch promotion' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const existing = await prisma.promotion.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }

    const body = await request.json()
    const data: {
      name?: string
      details?: string
      drawDetails?: string
      status?: string
      sortOrder?: number
    } = {}

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
      }
      data.name = name
    }
    if (typeof body.details === 'string') data.details = body.details.trim()
    if (typeof body.drawDetails === 'string') data.drawDetails = body.drawDetails.trim()
    if (body.status !== undefined) {
      if (!isPromotionStatus(body.status)) {
        return NextResponse.json({ error: 'Status must be active or completed' }, { status: 400 })
      }
      data.status = body.status
    }
    if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
      data.sortOrder = Math.trunc(body.sortOrder)
    }

    const promotion = await prisma.promotion.update({
      where: { id: params.id },
      data,
      include: promotionDetailInclude
    })
    return NextResponse.json(promotion)
  } catch (error) {
    console.error('Error updating promotion:', error)
    return NextResponse.json({ error: 'Failed to update promotion' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const existing = await prisma.promotion.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }
    await prisma.promotion.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting promotion:', error)
    return NextResponse.json({ error: 'Failed to delete promotion' }, { status: 500 })
  }
}
