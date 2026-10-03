import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { reportHarvestSyncStep } from '@/lib/harvest-sync'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/sync/step
 * Agent progress for one step: running, pass, fail, or paused (stops the queue).
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const agentKey = typeof body.agentKey === 'string' ? body.agentKey.trim() : ''
    const runId = typeof body.runId === 'string' ? body.runId.trim() : ''
    const taskKey = typeof body.taskKey === 'string' ? body.taskKey.trim() : ''
    const status = typeof body.status === 'string' ? body.status.trim() : ''
    if (!agentKey || !runId || !taskKey || !status) {
      return NextResponse.json({ error: 'agentKey, runId, taskKey, and status are required' }, { status: 400 })
    }
    const run = await reportHarvestSyncStep({
      agentKey,
      hostname: typeof body.hostname === 'string' ? body.hostname : null,
      version: typeof body.version === 'string' ? body.version : null,
      runId,
      taskKey,
      status,
      message: typeof body.message === 'string' ? body.message : null
    })
    return NextResponse.json({ ok: true, run })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update sync step'
    const status =
      message === 'Unknown sync step' ||
      message === 'Unknown step status' ||
      message === 'Sync step not found' ||
      message === 'Sync run is not active for this agent'
        ? 400
        : 500
    if (status === 500) console.error('Harvest sync step error:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
