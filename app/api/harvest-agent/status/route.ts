import { NextResponse } from 'next/server'
import { listHarvestStatus } from '@/lib/harvest-agent'

export const dynamic = 'force-dynamic'

/**
 * GET /api/harvest-agent/status
 * Session-authenticated harvest agent presence + recent task log.
 */
export async function GET() {
  try {
    const data = await listHarvestStatus()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Harvest status error:', error)
    return NextResponse.json({ error: 'Failed to load harvest agent status' }, { status: 500 })
  }
}
