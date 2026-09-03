import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  isValidReceiptDate,
  parseReceiptAmount,
  resolveEntrant
} from '@/lib/promotion-receipts'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; receiptId: string } }

const receiptSelect = {
  id: true,
  receiptDate: true,
  entrantName: true,
  staffId: true,
  amount: true,
  busRegistration: true,
  phone: true,
  createdAt: true,
  staff: { select: { id: true, name: true } }
} as const

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const existing = await prisma.promotionReceipt.findFirst({
      where: { id: params.receiptId, promotionId: params.id },
      select: { id: true }
    })
    if (!existing) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    const body = await request.json()
    const data: {
      receiptDate?: string
      entrantName?: string
      staffId?: string | null
      amount?: number
      busRegistration?: string
      phone?: string
    } = {}

    if (body.receiptDate !== undefined) {
      const receiptDate =
        typeof body.receiptDate === 'string' ? body.receiptDate.trim() : ''
      if (!isValidReceiptDate(receiptDate)) {
        return NextResponse.json(
          { error: 'Valid receipt date is required (YYYY-MM-DD)' },
          { status: 400 }
        )
      }
      data.receiptDate = receiptDate
    }

    if (body.amount !== undefined) {
      const amount = parseReceiptAmount(body.amount)
      if (amount == null) {
        return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 })
      }
      data.amount = amount
    }

    if (body.entrantName !== undefined || body.staffId !== undefined) {
      const entrant = await resolveEntrant({
        staffId: body.staffId,
        entrantName: body.entrantName
      })
      if ('error' in entrant) {
        return NextResponse.json({ error: entrant.error }, { status: 400 })
      }
      data.entrantName = entrant.entrantName
      data.staffId = entrant.staffId
    }

    if (typeof body.busRegistration === 'string') {
      data.busRegistration = body.busRegistration.trim()
    }
    if (typeof body.phone === 'string') {
      data.phone = body.phone.trim()
    }

    const receipt = await prisma.promotionReceipt.update({
      where: { id: params.receiptId },
      data,
      select: receiptSelect
    })

    return NextResponse.json({
      id: receipt.id,
      receiptDate: receipt.receiptDate,
      entrantName: receipt.staff?.name || receipt.entrantName,
      staffId: receipt.staffId,
      amount: receipt.amount,
      busRegistration: receipt.busRegistration,
      phone: receipt.phone,
      createdAt: receipt.createdAt.toISOString()
    })
  } catch (error) {
    console.error('Error updating promotion receipt:', error)
    return NextResponse.json({ error: 'Failed to update receipt' }, { status: 500 })
  }
}

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
