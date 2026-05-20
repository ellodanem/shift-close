import { NextResponse } from 'next/server'
import { buildAttendanceSyncHint } from '@/lib/attendance-sync-hint'

export const dynamic = 'force-dynamic'

/**
 * Tiny payload for polling: detect new punches, corrections, station “today” rollover,
 * pay-period changes, or raw-mode env toggles without loading the full log list.
 */
export async function GET() {
  try {
    return NextResponse.json(await buildAttendanceSyncHint())
  } catch (error) {
    console.error('Attendance sync-hint error:', error)
    return NextResponse.json({ error: 'Failed to load sync hint' }, { status: 500 })
  }
}
