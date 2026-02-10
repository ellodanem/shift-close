import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    const {
      date,
      ref,
      description,
      debitCash,
      debitEcard,
      debitDcard,
      creditAmt,
      bank,
      categoryId,
      amount,
      shiftId,
      paymentBatchId
    } = body as {
      date?: string
      ref?: string | null
      description?: string
      debitCash?: number
      debitEcard?: number
      debitDcard?: number
      creditAmt?: number
      bank?: string | null
      categoryId?: string
      amount?: number
      shiftId?: string | null
      paymentBatchId?: string | null
    }

    const data: any = {}
    if (date !== undefined) data.date = date.trim()
    if (ref !== undefined) data.ref = ref?.trim() || null
    if (description !== undefined) data.description = description.trim()
    if (debitCash !== undefined) data.debitCash = Number(debitCash) || 0
    if (debitEcard !== undefined) data.debitEcard = Number(debitEcard) || 0
    if (debitDcard !== undefined) data.debitDcard = Number(debitDcard) || 0
    if (creditAmt !== undefined) data.creditAmt = Number(creditAmt) || 0
    if (bank !== undefined) data.bank = bank?.trim() || null
    if (shiftId !== undefined) data.shiftId = shiftId || null
    if (paymentBatchId !== undefined) data.paymentBatchId = paymentBatchId || null

    const updateAllocations: any = {}
    if (categoryId !== undefined) {
      updateAllocations.categoryId = categoryId
    }
    if (amount !== undefined) {
      updateAllocations.amount = amount
    }

    const entry = await prisma.cashbookEntry.update({
      where: { id },
      data: {
        ...data,
        ...(Object.keys(updateAllocations).length > 0 && {
          allocations: {
            // We assume exactly one allocation per entry in v1
            updateMany: {
              where: {},
              data: updateAllocations
            }
          }
        })
      },
      include: {
        allocations: {
          include: { category: true }
        }
      }
    })

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error updating cashbook entry:', error)
    return NextResponse.json({ error: 'Failed to update cashbook entry' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    await prisma.cashbookEntry.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting cashbook entry:', error)
    return NextResponse.json({ error: 'Failed to delete cashbook entry' }, { status: 500 })
  }
}

