import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDefaultPromotions, isPromotionStatus } from '@/lib/promotions'

export const dynamic = 'force-dynamic'

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export async function GET() {
  try {
    await ensureDefaultPromotions()
    const promotions = await prisma.promotion.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { draws: true } },
        draws: {
          orderBy: { drawDate: 'desc' },
          take: 1,
          select: { drawDate: true }
        }
      }
    })
    return NextResponse.json(
      promotions.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        details: p.details,
        drawDetails: p.drawDetails,
        status: p.status,
        sortOrder: p.sortOrder,
        drawCount: p._count.draws,
        latestDrawDate: p.draws[0]?.drawDate ?? null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }))
    )
  } catch (error) {
    console.error('Error listing promotions:', error)
    return NextResponse.json({ error: 'Failed to list promotions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const details = typeof body.details === 'string' ? body.details.trim() : ''
    const drawDetails = typeof body.drawDetails === 'string' ? body.drawDetails.trim() : ''
    const status = isPromotionStatus(body.status) ? body.status : 'active'
    let slug =
      typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(name)
    if (!slug) slug = `promotion-${Date.now()}`

    const existing = await prisma.promotion.findUnique({ where: { slug } })
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`
    }

    const maxSort = await prisma.promotion.aggregate({ _max: { sortOrder: true } })
    const promotion = await prisma.promotion.create({
      data: {
        name,
        slug,
        details,
        drawDetails,
        status,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1
      }
    })
    return NextResponse.json(promotion, { status: 201 })
  } catch (error) {
    console.error('Error creating promotion:', error)
    return NextResponse.json({ error: 'Failed to create promotion' }, { status: 500 })
  }
}
