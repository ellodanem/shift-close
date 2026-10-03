import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { claimHarvestSyncRun } from '@/lib/harvest-sync'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/sync/claim
 * Agent poll. Claims the oldest pending run, or returns the run this agent already holds.
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const agentKey = typeof body.agentKey === 'string' ? body.agentKey.trim() : ''
    if (!agentKey) {
      return NextResponse.json({ error: 'agentKey is required' }, { status: 400 })
    }
    const result = await claimHarvestSyncRun({
      agentKey,
      hostname: typeof body.hostname === 'string' ? body.hostname : null,
      version: typeof body.version === 'string' ? body.version : null
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Harvest sync claim error:', error)
    return NextResponse.json({ error: 'Failed to claim sync' }, { status: 500 })
  }
}
