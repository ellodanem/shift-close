import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Map type + paymentMethod to debit/credit columns */
function mapToDebitCredit(
  type: 'income' | 'expense',
  paymentMethod: string | null | undefined,
  amount: number
): {
  debitCash: number
  debitCheck: number
  debitEcard: number
  debitDcard: number
  creditAmt: number
  paymentMethod: string | null
} {
  const amt = Math.abs(Number(amount)) || 0
  const base = { debitCash: 0, debitCheck: 0, debitEcard: 0, debitDcard: 0, creditAmt: 0, paymentMethod: null as string | null }

  if (type === 'income') {
    return { ...base, creditAmt: amt }
  }
  const pm = (paymentMethod || 'cash').toLowerCase()
  if (pm === 'check') return { ...base, debitCheck: amt, paymentMethod: 'check' }
  if (pm === 'deposit' || pm === 'eft') return { ...base, debitEcard: amt, paymentMethod: pm }
  if (pm === 'debit_credit' || pm === 'debit/credit') return { ...base, debitDcard: amt, paymentMethod: 'debit_credit' }
  return { ...base, debitCash: amt, paymentMethod: 'cash' }
}

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
      type,
      paymentMethod,
      debitCash,
      debitEcard,
      debitDcard,
      debitCheck,
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
      type?: 'income' | 'expense'
      paymentMethod?: string | null
      debitCash?: number
      debitEcard?: number
      debitDcard?: number
      debitCheck?: number
      creditAmt?: number
      bank?: string | null
      categoryId?: string
      amount?: number
      shiftId?: string | null
      paymentBatchId?: string | null
    }

    const data: Record<string, unknown> = {}
    if (date !== undefined) data.date = date.trim()
    if (ref !== undefined) data.ref = ref?.trim() || null
    if (description !== undefined) data.description = description.trim()
    if (bank !== undefined) data.bank = bank?.trim() || null
    if (shiftId !== undefined) data.shiftId = shiftId || null
    if (paymentBatchId !== undefined) data.paymentBatchId = paymentBatchId || null

    const amt = typeof amount === 'number' && !Number.isNaN(amount) ? amount : undefined

    if (type === 'income' || type === 'expense') {
      const mapped = mapToDebitCredit(type, paymentMethod, amt ?? 0)
      Object.assign(data, mapped)
    } else {
      if (debitCash !== undefined) data.debitCash = Number(debitCash) || 0
      if (debitCheck !== undefined) data.debitCheck = Number(debitCheck) || 0
      if (debitEcard !== undefined) data.debitEcard = Number(debitEcard) || 0
      if (debitDcard !== undefined) data.debitDcard = Number(debitDcard) || 0
      if (creditAmt !== undefined) data.creditAmt = Number(creditAmt) || 0
    }

    const updateAllocations: Record<string, unknown> = {}
    if (categoryId !== undefined) updateAllocations.categoryId = categoryId
    if (amount !== undefined) updateAllocations.amount = amount

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

