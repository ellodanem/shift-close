import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; receiptId: string } }

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const receipt = await prisma.promotionReceipt.findFirst({
      where: { id: params.receiptId, promotionId: params.id },
      select: { id: true }
    })
    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    await prisma.promotionReceipt.delete({ where: { id: params.receiptId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting promotion receipt:', error)
    return NextResponse.json({ error: 'Failed to delete receipt' }, { status: 500 })
  }
}
