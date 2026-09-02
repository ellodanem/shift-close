import { NextRequest, NextResponse } from 'next/server'
import { harvestAgentSecretOk } from '@/lib/harvest-agent'
import { buildSampleHarvestTaskEmail, sendHarvestTaskEmailTo } from '@/lib/harvest-agent-email'

export const dynamic = 'force-dynamic'

/**
 * POST /api/harvest-agent/email/test
 * Send a sample harvest summary email (protected by HARVEST_AGENT_SECRET).
 * Body: { to: "email@example.com" }
 */
export async function POST(request: NextRequest) {
  if (!harvestAgentSecretOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    if (!to) {
      return NextResponse.json({ error: 'to is required' }, { status: 400 })
    }

    const sample = buildSampleHarvestTaskEmail()
    await sendHarvestTaskEmailTo(sample, to)
    return NextResponse.json({ ok: true, to, sample: true })
  } catch (error) {
    console.error('Harvest email test error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send sample email'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
