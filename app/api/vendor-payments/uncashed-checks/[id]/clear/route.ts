import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// PATCH mark check as cleared (deduct from balance)
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const batch = await prisma.vendorPaymentBatch.findUnique({
      where: { id }
    })

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    if (batch.paymentMethod !== 'check') {
      return NextResponse.json(
        { error: 'Only check payments can be cleared' },
        { status: 400 }
      )
    }

    if (batch.clearedAt) {
      return NextResponse.json(
        { error: 'Check already cleared' },
        { status: 400 }
      )
    }

    const existingBalance = await prisma.balance.findUnique({
      where: { id: 'balance' }
    })

    const amount = roundMoney(batch.totalAmount)

    if (existingBalance) {
      const updatedAvailable = roundMoney(existingBalance.availableFunds - amount)
      await prisma.balance.update({
        where: { id: 'balance' },
        data: {
          availableFunds: updatedAvailable,
          balanceAfter: roundMoney(updatedAvailable - existingBalance.planned)
        }
      })
    } else {
      await prisma.balance.create({
        data: {
          id: 'balance',
          currentBalance: 0,
          availableFunds: roundMoney(0 - amount),
          planned: 0,
          balanceAfter: roundMoney(0 - amount)
        }
      })
    }

    await prisma.vendorPaymentBatch.update({
      where: { id },
      data: { clearedAt: new Date() }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error clearing check:', error)
    return NextResponse.json(
      { error: 'Failed to clear check' },
      { status: 500 }
    )
  }
}
