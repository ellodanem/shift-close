import { NextRequest, NextResponse } from 'next/server'
import { ingestAttendanceBatch } from '@/lib/attendance-ingest-shared'

export const dynamic = 'force-dynamic'

/**
 * POST /api/attendance/ingest
 * Receives attendance logs pushed from the local Windows/Pi agent (backup polling).
 * Protected by AGENT_SECRET header.
 *
 * Body: { logs: Array<{ deviceUserId, recordTime, state? }> }
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-agent-secret')
  const expectedSecret = process.env.AGENT_SECRET

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const logs: Array<{ deviceUserId: string; recordTime: string; state?: number }> = body.logs || []

    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No logs provided' })
    }

    const receivedAt = new Date()
    const { synced, total, bulk } = await ingestAttendanceBatch({
      logs,
      receivedAt,
      deviceSerial: null,
      source: 'agent',
      allowLearn: false
    })

    return NextResponse.json({ synced, total, bulk })
  } catch (error) {
    console.error('Ingest error:', error)
    return NextResponse.json({ error: 'Failed to ingest logs' }, { status: 500 })
  }
}
