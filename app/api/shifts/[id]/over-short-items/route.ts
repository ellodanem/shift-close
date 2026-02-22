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

/** POST - Create over/short item (standard or cheque balance) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shiftId } = await params
    const body = await request.json()

    const {
      type,
      amount,
      description,
      itemKind,
      customerName,
      previousBalance,
      dispensedAmount,
      newBalance
    } = body as {
      type?: string
      amount?: number
      description?: string
      itemKind?: string
      customerName?: string
      previousBalance?: number
      dispensedAmount?: number
      newBalance?: number
    }

    const kind = itemKind === 'cheque_balance' ? 'cheque_balance' : 'standard'

    if (!type || !['overage', 'shortage'].includes(type)) {
      return NextResponse.json({ error: 'type must be "overage" or "shortage"' }, { status: 400 })
    }

    const amt = typeof amount === 'number' && !Number.isNaN(amount) ? amount : Number(amount)
    if (amt <= 0) {
      return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 })
    }

    if (kind === 'cheque_balance') {
      if (!customerName || !String(customerName).trim()) {
        return NextResponse.json({ error: 'Customer name is required for cheque balance items' }, { status: 400 })
      }
    } else {
      if (!description || !String(description).trim()) {
        return NextResponse.json({ error: 'description is required' }, { status: 400 })
      }
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

    const descriptionText = kind === 'cheque_balance'
      ? `${String(customerName).trim()} cheque${newBalance != null && newBalance > 0 ? ` (new bal $${Number(newBalance).toFixed(2)})` : ''}`
      : String(description).trim()

    const item = await prisma.overShortItem.create({
      data: {
        shiftId,
        type,
        amount: amt,
        description: descriptionText,
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
        itemKind: kind,
        customerName: kind === 'cheque_balance' ? String(customerName).trim() : null,
        previousBalance: kind === 'cheque_balance' && previousBalance != null ? Number(previousBalance) : null,
        dispensedAmount: kind === 'cheque_balance' && dispensedAmount != null ? Number(dispensedAmount) : null,
        newBalance: kind === 'cheque_balance' && newBalance != null ? Number(newBalance) : null
      }
    })
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Error creating over-short item:', error)
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }
}
