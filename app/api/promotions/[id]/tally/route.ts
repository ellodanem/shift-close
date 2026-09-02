import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeEntrantKey } from '@/lib/promotion-entries'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

/**
 * GET /api/promotions/[id]/tally?year=2026
 * Aggregates entrant participation across draws (regularity ranking).
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: params.id },
      select: { id: true, name: true }
    })
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }

    const yearParam = request.nextUrl.searchParams.get('year')
    const year =
      yearParam && /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getFullYear())

    const draws = await prisma.promotionDraw.findMany({
      where: {
        promotionId: params.id,
        drawDate: { gte: `${year}-01-01`, lte: `${year}-12-31` }
      },
      select: {
        id: true,
        drawDate: true,
        entries: {
          select: {
            id: true,
            staffId: true,
            entrantName: true,
            staff: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { drawDate: 'asc' }
    })

    type Bucket = {
      key: string
      staffId: string | null
      name: string
      entryCount: number
      drawDates: string[]
    }
    const buckets = new Map<string, Bucket>()

    for (const draw of draws) {
      const seenInDraw = new Set<string>()
      for (const entry of draw.entries) {
        const key = entry.staffId
          ? `staff:${entry.staffId}`
          : `name:${normalizeEntrantKey(entry.entrantName)}`
        if (seenInDraw.has(key)) continue
        seenInDraw.add(key)

        const existing = buckets.get(key)
        const displayName = entry.staff?.name || entry.entrantName
        if (existing) {
          existing.entryCount += 1
          existing.drawDates.push(draw.drawDate)
          if (!existing.staffId && entry.staffId) existing.staffId = entry.staffId
          if (entry.staff?.name) existing.name = entry.staff.name
        } else {
          buckets.set(key, {
            key,
            staffId: entry.staffId,
            name: displayName,
            entryCount: 1,
            drawDates: [draw.drawDate]
          })
        }
      }
    }

    const ranking = [...buckets.values()].sort((a, b) => {
      if (b.entryCount !== a.entryCount) return b.entryCount - a.entryCount
      return a.name.localeCompare(b.name)
    })

    const totalEntries = draws.reduce((sum, d) => sum + d.entries.length, 0)

    return NextResponse.json({
      promotionId: promotion.id,
      promotionName: promotion.name,
      year,
      drawCount: draws.length,
      totalEntries,
      uniqueEntrants: ranking.length,
      ranking
    })
  } catch (error) {
    console.error('Error building promotion tally:', error)
    return NextResponse.json({ error: 'Failed to load tally' }, { status: 500 })
  }
}
