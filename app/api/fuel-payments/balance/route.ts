import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  balanceAfterFromAvailable,
  refreshBalanceSnapshot,
  sumPendingFuelInvoiceAmounts
} from '@/lib/fuelBalance'
import { phantomBalances } from '@/lib/checkBalanceAccount'
import { sumUncashedChecksBySource } from '@/lib/uncashedChecks'

// GET current balance
export async function GET() {
  try {
    const balance = await refreshBalanceSnapshot()

    // Uncashed vendor checks are reserved on both accounts. Cashbook checks stay on Westline.
    const uncashed = await sumUncashedChecksBySource()
    const phantoms = phantomBalances({
      westlineAvailable: balance.availableFunds,
      serviceStationAvailable: balance.totalAutoAvailable,
      vendorUncashed: uncashed.vendor,
      cashbookUncashed: uncashed.cashbook
    })

    return NextResponse.json({
      ...balance,
      ...phantoms
    })
  } catch (error) {
    console.error('Error fetching balance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}

// PATCH update balance (Westline and Service Station / Total Auto current + available)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { currentBalance, availableFunds, totalAutoCurrentBalance, totalAutoAvailable } = body

    if (
      currentBalance === undefined &&
      availableFunds === undefined &&
      totalAutoCurrentBalance === undefined &&
      totalAutoAvailable === undefined
    ) {
      return NextResponse.json(
        {
          error:
            'currentBalance, availableFunds, totalAutoCurrentBalance, or totalAutoAvailable must be provided'
        },
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
          totalAutoCurrentBalance: totalAutoCurrentBalance ?? 0,
          totalAutoAvailable: totalAutoAvailable ?? 0,
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
      if (totalAutoCurrentBalance !== undefined) {
        updateData.totalAutoCurrentBalance = roundMoney(Number(totalAutoCurrentBalance))
      }
      if (totalAutoAvailable !== undefined) {
        updateData.totalAutoAvailable = roundMoney(Number(totalAutoAvailable))
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

