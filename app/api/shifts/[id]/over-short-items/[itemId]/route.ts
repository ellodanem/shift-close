import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** DELETE - Remove over/short item */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: shiftId, itemId } = await params
    const item = await prisma.overShortItem.findFirst({
      where: { id: itemId, shiftId }
    })
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }
    await prisma.overShortItem.delete({
      where: { id: itemId }
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting over-short item:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}
