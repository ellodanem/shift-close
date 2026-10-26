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
import { sendMail } from '@/lib/email'
import { getSessionFromRequest } from '@/lib/session'
import { isAccountantRole } from '@/lib/roles'

const ACCOUNTANT_BALANCE_NOTICE_RECIPIENT = 'dane.elrus1@gmail.com'

type BalanceNoticeValues = {
  currentBalance: number
  availableFunds: number
  totalAutoCurrentBalance: number
  totalAutoAvailable: number
}

function money(value: number): string {
  return `XCD ${roundMoney(value).toFixed(2)}`
}

async function sendAccountantBalanceUpdateEmail({
  userId,
  before,
  after
}: {
  userId: string
  before: BalanceNoticeValues
  after: BalanceNoticeValues
}): Promise<void> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { username: true, firstName: true, lastName: true, email: true }
  })
  const name = [user?.firstName?.trim(), user?.lastName?.trim()].filter(Boolean).join(' ') || user?.username || 'Accountant'
  const actor = user?.email ? `${name} (${user.email})` : name
  const lines = [
    'Bank balances updated in Shift Close',
    '',
    `Updated by: ${actor}`,
    '',
    `Westline Ent current balance: ${money(before.currentBalance)} to ${money(after.currentBalance)}`,
    `Westline Ent available funds: ${money(before.availableFunds)} to ${money(after.availableFunds)}`,
    `Service Station current balance: ${money(before.totalAutoCurrentBalance)} to ${money(after.totalAutoCurrentBalance)}`,
    `Service Station available funds: ${money(before.totalAutoAvailable)} to ${money(after.totalAutoAvailable)}`
  ]

  await sendMail({
    to: ACCOUNTANT_BALANCE_NOTICE_RECIPIENT,
    subject: `Bank balances updated by ${name}`,
    text: lines.join('\n')
  })
}

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
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const before: BalanceNoticeValues = {
      currentBalance: existingBalance?.currentBalance ?? 0,
      availableFunds: existingBalance?.availableFunds ?? 0,
      totalAutoCurrentBalance: existingBalance?.totalAutoCurrentBalance ?? 0,
      totalAutoAvailable: existingBalance?.totalAutoAvailable ?? 0
    }
    let balance

    if (!existingBalance) {
      // Create initial balance
      balance = await prisma.balance.create({
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

      balance = await prisma.balance.update({
        where: { id: 'balance' },
        data: updateData
      })
    }

    if (isAccountantRole(session.role)) {
      await sendAccountantBalanceUpdateEmail({ userId: session.userId, before, after: balance })
    }

    return NextResponse.json(balance)
  } catch (error) {
    console.error('Error updating balance:', error)
    return NextResponse.json(
      { error: 'Failed to update balance' },
      { status: 500 }
    )
  }
}

