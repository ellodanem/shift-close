import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET - List over/short items for a shift */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shiftId } = await params
    const shift = await prisma.shiftClose.findUnique({
      where: { id: shiftId },
      select: { id: true }
    })
    if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

    const items = await prisma.overShortItem.findMany({
      where: { shiftId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error('Error fetching over-short items:', error)
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }
}

/** POST - Create over/short item. Body: { type: "add"|"subtract"|"note", amount: number, description: string } */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shiftId } = await params
    const body = await request.json()
    const { type: itemType, amount, description } = body as {
      type?: string
      amount?: number
      description?: string
    }

    const typeMap = { add: 'overage', subtract: 'shortage', note: 'overage' } as const
    const resolved = typeMap[itemType as keyof typeof typeMap] ?? typeMap.add
    const isNote = itemType === 'note'

    const amt = Math.abs(Number(amount) || 0)
    if (!isNote && amt <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }
    if (!(description ?? '').trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }

    const shift = await prisma.shiftClose.findUnique({
      where: { id: shiftId },
      select: { id: true }
    })
    if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

    const maxOrder = await prisma.overShortItem.findFirst({
      where: { shiftId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    })

    const item = await prisma.overShortItem.create({
      data: {
        shiftId,
        type: resolved,
        amount: isNote ? 0 : amt,
        description: (description || '').trim(),
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
        itemKind: 'other',
        noteOnly: isNote
      }
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Error creating over-short item:', error)
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }
}
