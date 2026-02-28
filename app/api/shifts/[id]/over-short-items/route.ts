import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Categories that carry account balances
const ACCOUNT_KINDS = ['cheque_received', 'debit_received', 'fuel_taken']

// Determine type (overage/shortage) and noteOnly from itemKind + paymentMethod
function resolveItemMeta(
  itemKind: string,
  paymentMethod: string | undefined
): { type: string; noteOnly: boolean } {
  switch (itemKind) {
    case 'cheque_received':
      return { type: 'overage', noteOnly: false }
    case 'debit_received':
      // Debit swiped = physical overage until picked up; affects over/short
      return { type: 'overage', noteOnly: false }
    case 'fuel_taken':
      // Fuel taken against a debit account is note-only; cheque is a real shortage
      return {
        type: 'shortage',
        noteOnly: paymentMethod === 'debit'
      }
    case 'withdrawal':
      return { type: 'shortage', noteOnly: false }
    case 'return':
      return { type: 'overage', noteOnly: false }
    case 'other':
    default:
      return { type: 'overage', noteOnly: false } // caller overrides type for 'other'
  }
}

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

/** POST - Create over/short item */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shiftId } = await params
    const body = await request.json()

    const {
      itemKind = 'other',
      paymentMethod,
      amount,
      description,
      type: typeOverride, // only used for 'other' kind
      customerName,
      previousBalance,
      dispensedAmount,
      newBalance
    } = body as {
      itemKind?: string
      paymentMethod?: string
      amount?: number
      description?: string
      type?: string
      customerName?: string
      previousBalance?: number
      dispensedAmount?: number
      newBalance?: number
    }

    // Resolve type and noteOnly from category
    const { type: resolvedType, noteOnly } = resolveItemMeta(itemKind, paymentMethod)
    const finalType = itemKind === 'other' && typeOverride ? typeOverride : resolvedType

    const amt = Math.abs(Number(amount) || 0)

    // Validate amount — note-only items can have zero amount (it's just a log)
    if (!noteOnly && amt <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    // Validate description / customer name
    const isAccountKind = ACCOUNT_KINDS.includes(itemKind)
    if (isAccountKind) {
      if (!customerName?.trim()) {
        return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
      }
    } else {
      if (!description?.trim() && itemKind !== 'withdrawal' && itemKind !== 'return') {
        // withdrawal and return can have empty description (who is optional)
      }
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

    // Auto-build description for account items
    let finalDescription = (description || '').trim()
    if (isAccountKind && customerName) {
      const name = customerName.trim()
      if (itemKind === 'cheque_received') finalDescription = `${name} — cheque received`
      else if (itemKind === 'debit_received') finalDescription = `${name} — debit pre-auth`
      else if (itemKind === 'fuel_taken') {
        const method = paymentMethod === 'debit' ? 'debit account' : 'cheque account'
        finalDescription = `${name} — fuel/cash from ${method}`
        if (newBalance != null && newBalance > 0) finalDescription += ` (bal $${Number(newBalance).toFixed(2)})`
      }
    }

    const item = await prisma.overShortItem.create({
      data: {
        shiftId,
        type: finalType,
        amount: noteOnly ? 0 : amt, // note-only items have zero financial impact
        description: finalDescription,
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
        itemKind,
        paymentMethod: paymentMethod || null,
        noteOnly,
        customerName: customerName?.trim() || null,
        previousBalance: previousBalance != null ? Number(previousBalance) : null,
        dispensedAmount: dispensedAmount != null ? Number(dispensedAmount) : null,
        newBalance: newBalance != null ? Number(newBalance) : null
      }
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Error creating over-short item:', error)
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }
}
