import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET - List over/short items for a shift (also available via shift include) */
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
    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }
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

/** POST - Create over/short item */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shiftId } = await params
    const body = await request.json()
    const { type, amount, description } = body as {
      type?: string
      amount?: number
      description?: string
    }
    if (!type || !['overage', 'shortage'].includes(type)) {
      return NextResponse.json({ error: 'type must be "overage" or "shortage"' }, { status: 400 })
    }
    const amt = typeof amount === 'number' && !Number.isNaN(amount) ? amount : Number(amount)
    if (amt <= 0) {
      return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 })
    }
    if (!description || !String(description).trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }
    const shift = await prisma.shiftClose.findUnique({
      where: { id: shiftId },
      select: { id: true }
    })
    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }
    const maxOrder = await prisma.overShortItem.findFirst({
      where: { shiftId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    })
    const item = await prisma.overShortItem.create({
      data: {
        shiftId,
        type,
        amount: amt,
        description: String(description).trim(),
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1
      }
    })
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Error creating over-short item:', error)
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }
}
