import { NextResponse } from 'next/server'
import { getHarvestHealth } from '@/lib/harvest-health'

export const dynamic = 'force-dynamic'

/**
 * GET /api/customer-accounts/sync-health
 * Whether Cstore data is syncing (agent paused/offline, last customer sync time).
 * Lives under /api/customer-accounts so every role that can open the page can read it.
 */
export async function GET() {
  try {
    return NextResponse.json(await getHarvestHealth())
  } catch (error) {
    console.error('Customer accounts sync-health error:', error)
    return NextResponse.json({ error: 'Failed to load sync health' }, { status: 500 })
  }
}
