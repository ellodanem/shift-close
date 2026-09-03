import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildDriverProfiles } from '@/lib/promotion-receipts'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: params.id },
      select: { id: true }
    })
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }

    const receipts = await prisma.promotionReceipt.findMany({
      where: { promotionId: params.id },
      select: {
        receiptDate: true,
        entrantName: true,
        staffId: true,
        busRegistration: true,
        phone: true,
        staff: { select: { name: true } }
      },
      orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }]
    })

    const drivers = buildDriverProfiles(receipts)
    const recentNames: string[] = []
    const seen = new Set<string>()
    for (const receipt of receipts) {
      const name = receipt.staff?.name || receipt.entrantName
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      recentNames.push(name)
      if (recentNames.length >= 8) break
    }

    return NextResponse.json({ drivers, recentNames })
  } catch (error) {
    console.error('Error loading promotion drivers:', error)
    return NextResponse.json({ error: 'Failed to load drivers' }, { status: 500 })
  }
}
