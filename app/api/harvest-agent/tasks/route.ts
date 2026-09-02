import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk, recordHarvestTask } from '@/lib/harvest-agent'

export const dynamic = 'force-dynamic'

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? fallback : d
}

/**
 * POST /api/harvest-agent/tasks
 * Record a harvest job result (pass/fail). Protected by HARVEST_AGENT_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const agentKey = typeof body.agentKey === 'string' ? body.agentKey : ''
    const taskKey = typeof body.taskKey === 'string' ? body.taskKey : ''
    if (!agentKey.trim() || !taskKey.trim()) {
      return NextResponse.json({ error: 'agentKey and taskKey are required' }, { status: 400 })
    }

    const finishedAt = parseDate(body.finishedAt, new Date())
    const startedAt = parseDate(body.startedAt, finishedAt)

    const { run } = await recordHarvestTask({
      agentKey,
      hostname: typeof body.hostname === 'string' ? body.hostname : null,
      version: typeof body.version === 'string' ? body.version : null,
      taskKey,
      status: typeof body.status === 'string' ? body.status : 'fail',
      message: typeof body.message === 'string' ? body.message : null,
      details: body.details ?? null,
      startedAt,
      finishedAt,
      cstoreSessionOk:
        typeof body.cstoreSessionOk === 'boolean' ? body.cstoreSessionOk : null
    })

    return NextResponse.json({ ok: true, id: run.id, status: run.status })
  } catch (error) {
    console.error('Harvest task error:', error)
    return NextResponse.json({ error: 'Failed to record task' }, { status: 500 })
  }
}
