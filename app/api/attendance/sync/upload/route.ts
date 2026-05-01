import { NextRequest, NextResponse } from 'next/server'
import { ingestAttendanceBatch } from '@/lib/attendance-ingest-shared'

export const dynamic = 'force-dynamic'

type UploadLog = {
  deviceUserId: string
  recordTime: string
  state?: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const logs: UploadLog[] = Array.isArray(body?.logs) ? body.logs : []
    if (logs.length === 0) {
      return NextResponse.json({ error: 'No punches selected' }, { status: 400 })
    }

    const seen = new Set<string>()
    const deduped: UploadLog[] = []
    for (const log of logs) {
      const deviceUserId = String(log.deviceUserId || '').trim()
      if (!deviceUserId) continue
      const key = `${deviceUserId}|${String(log.recordTime ?? '').trim()}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(log)
    }

    const receivedAt = new Date()
    const { synced, total, bulk } = await ingestAttendanceBatch({
      logs: deduped,
      receivedAt,
      deviceSerial: null,
      source: 'zkteco',
      allowLearn: false
    })

    return NextResponse.json({ synced, total, bulk })
  } catch (error) {
    console.error('Attendance sync upload error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to upload selected punches'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
