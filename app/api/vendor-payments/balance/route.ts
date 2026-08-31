import { NextResponse } from 'next/server'
import { roundMoney } from '@/lib/fuelPayments'
import { refreshBalanceSnapshot } from '@/lib/fuelBalance'
import { sumUncashedChecks } from '@/lib/uncashedChecks'

// GET balance with uncashed checks (shared with fuel payments)
export async function GET() {
  try {
    const balance = await refreshBalanceSnapshot()

    const uncashedTotal = await sumUncashedChecks()
    const availableFunds = balance.availableFunds
    const netBalance = roundMoney(availableFunds - uncashedTotal)

    return NextResponse.json({
      availableFunds,
      uncashedChecksTotal: uncashedTotal,
      netBalance,
      planned: balance.planned,
      balanceAfter: balance.balanceAfter
    })
  } catch (error) {
    console.error('Error fetching vendor balance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}
