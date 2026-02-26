import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET balance with uncashed checks (shared with fuel payments)
export async function GET() {
  try {
    const balance = await prisma.balance.findUnique({
      where: { id: 'balance' }
    })

    const uncashedChecks = await prisma.vendorPaymentBatch.aggregate({
      where: {
        paymentMethod: 'check',
        clearedAt: null
      },
      _sum: { totalAmount: true }
    })

    const uncashedTotal = roundMoney(uncashedChecks._sum.totalAmount ?? 0)
    const availableFunds = balance ? balance.availableFunds : 0
    const netBalance = roundMoney(availableFunds - uncashedTotal)

    return NextResponse.json({
      availableFunds,
      uncashedChecksTotal: uncashedTotal,
      netBalance,
      planned: balance?.planned ?? 0,
      balanceAfter: balance?.balanceAfter ?? 0
    })
  } catch (error) {
    console.error('Error fetching vendor balance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}
