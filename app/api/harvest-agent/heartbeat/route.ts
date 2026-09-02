import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk, upsertHarvestHeartbeat } from '@/lib/harvest-agent'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/heartbeat
 * Local harvest agent keep-alive. Protected by HARVEST_AGENT_SECRET (falls back to AGENT_SECRET).
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const agentKey = typeof body.agentKey === 'string' ? body.agentKey : ''
    if (!agentKey.trim()) {
      return NextResponse.json({ error: 'agentKey is required' }, { status: 400 })
    }

    const agent = await upsertHarvestHeartbeat({
      agentKey,
      hostname: typeof body.hostname === 'string' ? body.hostname : null,
      version: typeof body.version === 'string' ? body.version : null,
      cstoreSessionOk:
        typeof body.cstoreSessionOk === 'boolean' ? body.cstoreSessionOk : null,
      paused: typeof body.paused === 'boolean' ? body.paused : null,
      pauseReason: typeof body.pauseReason === 'string' ? body.pauseReason : null
    })

    return NextResponse.json({ ok: true, id: agent.id, lastHeartbeatAt: agent.lastHeartbeatAt })
  } catch (error) {
    console.error('Harvest heartbeat error:', error)
    return NextResponse.json({ error: 'Failed to record heartbeat' }, { status: 500 })
  }
}
