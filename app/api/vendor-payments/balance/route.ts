import { NextResponse } from 'next/server'
import { phantomBalances } from '@/lib/checkBalanceAccount'
import { refreshBalanceSnapshot } from '@/lib/fuelBalance'
import { sumUncashedChecksBySource } from '@/lib/uncashedChecks'

// GET balance with uncashed checks (shared with fuel payments)
export async function GET() {
  try {
    const balance = await refreshBalanceSnapshot()
    const uncashed = await sumUncashedChecksBySource()
    const phantoms = phantomBalances({
      westlineAvailable: balance.availableFunds,
      serviceStationAvailable: balance.totalAutoAvailable,
      vendorUncashed: uncashed.vendor,
      cashbookUncashed: uncashed.cashbook
    })

    return NextResponse.json({
      availableFunds: balance.availableFunds,
      totalAutoAvailable: balance.totalAutoAvailable,
      uncashedChecksTotal: phantoms.uncashedChecksTotal,
      vendorUncashedChecksTotal: phantoms.vendorUncashedChecksTotal,
      netBalance: phantoms.phantom,
      serviceStationPhantom: phantoms.serviceStationPhantom,
      serviceStationUncashedChecksTotal: phantoms.serviceStationUncashedChecksTotal,
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
