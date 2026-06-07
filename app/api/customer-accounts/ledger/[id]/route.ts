import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

type RouteContext = { params: Promise<{ id: string }> }

// PATCH /api/customer-accounts/ledger/[id]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const existing = await prisma.customerArLedgerLine.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const paymentMethodOnly =
      existing.source === 'payment_record' &&
      body.paymentMethod !== undefined &&
      body.date === undefined &&
      body.lineType === undefined &&
      body.amount === undefined &&
      body.memo === undefined &&
      body.ref === undefined

    if (existing.source === 'payment_record' && !paymentMethodOnly) {
      return NextResponse.json(
        { error: 'Edit amount/date in Record Payment instead' },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}
    if (body.date && typeof body.date === 'string') data.date = body.date.trim()
    if (body.lineType === 'charge' || body.lineType === 'payment') {
      data.lineType = body.lineType
    }
    if (body.amount != null) {
      const amt = Number(body.amount)
      if (Number.isNaN(amt) || amt <= 0) {
        return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
      }
      data.amount = roundMoney(amt)
    }
    if (body.memo !== undefined) {
      data.memo =
        typeof body.memo === 'string' && body.memo.trim() ? body.memo.trim() : null
    }
    if (body.paymentMethod !== undefined) {
      data.paymentMethod =
        typeof body.paymentMethod === 'string' && body.paymentMethod.trim()
          ? body.paymentMethod.trim()
          : null
    }
    if (body.ref !== undefined) {
      data.ref =
        typeof body.ref === 'string' && body.ref.trim() ? body.ref.trim() : null
    }

    const updated = await prisma.customerArLedgerLine.update({
      where: { id },
      data
    })

    if (
      paymentMethodOnly &&
      existing.paymentId &&
      data.paymentMethod !== undefined
    ) {
      await prisma.customerArPayment.update({
        where: { id: existing.paymentId },
        data: { paymentMethod: data.paymentMethod as string | null }
      })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating ledger line:', error)
    return NextResponse.json(
      { error: 'Failed to update ledger line' },
      { status: 500 }
    )
  }
}

// DELETE /api/customer-accounts/ledger/[id]
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const existing = await prisma.customerArLedgerLine.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.source === 'payment_record') {
      return NextResponse.json(
        { error: 'Delete the payment in Record Payment instead' },
        { status: 400 }
      )
    }
    await prisma.customerArLedgerLine.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting ledger line:', error)
    return NextResponse.json(
      { error: 'Failed to delete ledger line' },
      { status: 500 }
    )
  }
}
