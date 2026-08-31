import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  balanceAfterFromAvailable,
  refreshBalanceSnapshot,
  sumPendingFuelInvoiceAmounts
} from '@/lib/fuelBalance'
import { sumUncashedChecks } from '@/lib/uncashedChecks'

// GET current balance
export async function GET() {
  try {
    const balance = await refreshBalanceSnapshot()

    // Uncashed checks reduce spendable balance (vendor batches + cashbook check expenses).
    const uncashedChecksTotal = await sumUncashedChecks()
    const phantom = roundMoney(balance.availableFunds - uncashedChecksTotal)

    return NextResponse.json({
      ...balance,
      uncashedChecksTotal,
      phantom
    })
  } catch (error) {
    console.error('Error fetching balance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}

// PATCH update balance (currentBalance and availableFunds)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { currentBalance, availableFunds } = body

    if (currentBalance === undefined && availableFunds === undefined) {
      return NextResponse.json(
        { error: 'currentBalance or availableFunds must be provided' },
        { status: 400 }
      )
    }

    // Use upsert to ensure balance record exists
    const existingBalance = await prisma.balance.findUnique({
      where: { id: 'balance' }
    })

    if (!existingBalance) {
      // Create initial balance
      const newBalance = await prisma.balance.create({
        data: {
          id: 'balance',
          currentBalance: currentBalance ?? 0,
          availableFunds: availableFunds ?? currentBalance ?? 0,
          planned: 0,
          balanceAfter: (availableFunds ?? currentBalance ?? 0) - 0
        }
      })
      return NextResponse.json(newBalance)
    } else {
      const updateData: any = {}
      if (currentBalance !== undefined) {
        updateData.currentBalance = roundMoney(Number(currentBalance))
      }
      if (availableFunds !== undefined) {
        updateData.availableFunds = roundMoney(Number(availableFunds))
      }

      const finalAvailableFunds = updateData.availableFunds ?? existingBalance.availableFunds
      updateData.planned = await sumPendingFuelInvoiceAmounts()
      updateData.balanceAfter = balanceAfterFromAvailable(finalAvailableFunds)

      const balance = await prisma.balance.update({
        where: { id: 'balance' },
        data: updateData
      })
      return NextResponse.json(balance)
    }
  } catch (error) {
    console.error('Error updating balance:', error)
    return NextResponse.json(
      { error: 'Failed to update balance' },
      { status: 500 }
    )
  }
}

