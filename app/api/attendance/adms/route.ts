import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * ZKTeco PUSH SDK (ADMS) protocol handler.
 *
 * The F22 device hits two endpoints on this path:
 *   GET  /api/attendance/adms  — device polls for pending commands
 *   POST /api/attendance/adms  — device pushes attendance records (ATTLOG)
 *
 * Configure the device:
 *   COMM → Cloud Server Setting
 *   Server Address : your-app.vercel.app
 *   Server Port    : 443
 *   HTTPS          : ON
 *   Enable Domain  : ON
 */

// GET — respond to device heartbeat / command poll
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sn = searchParams.get('SN') || 'unknown'
  console.log(`[ADMS] Device heartbeat SN=${sn}`)
  // No pending commands — tell device nothing to do
  return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

// POST — device pushes attendance data
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const table = searchParams.get('table')
    const sn = searchParams.get('SN') || 'unknown'

    // Only handle attendance log table
    if (table !== 'ATTLOG') {
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    const body = await request.text()
    if (!body.trim()) {
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    // Build staff lookup map: deviceUserId → staffId
    const allStaff = await prisma.staff.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, deviceUserId: true }
    })
    const staffMap = new Map<string, { id: string; name: string }>()
    for (const s of allStaff) {
      if (s.deviceUserId) staffMap.set(s.deviceUserId.trim(), { id: s.id, name: s.name })
    }

    // Parse ATTLOG lines
    // Format: <UserID>\t<YYYY-MM-DD HH:MM:SS>\t<State>\t<Verified>\t<WorkCode>\t<Reserved>
    // State: 0=check-in, 1=check-out, 4=overtime-in, 5=overtime-out
    const lines = body.trim().split(/\r?\n/)
    let created = 0

    // Group punches per user per day to infer in/out if state is ambiguous
    const byUserDay = new Map<string, Array<{ deviceUserId: string; punchTime: Date; state: number }>>()

    const parsed: Array<{ deviceUserId: string; punchTime: Date; state: number }> = []

    for (const line of lines) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const deviceUserId = (parts[0] || '').trim()
      const timestampStr = (parts[1] || '').trim()
      const state = parseInt(parts[2] || '0', 10)

      if (!deviceUserId || !timestampStr) continue

      const punchTime = new Date(timestampStr)
      if (isNaN(punchTime.getTime())) continue

      parsed.push({ deviceUserId, punchTime, state })

      const dayKey = `${deviceUserId}|${punchTime.toISOString().slice(0, 10)}`
      if (!byUserDay.has(dayKey)) byUserDay.set(dayKey, [])
      byUserDay.get(dayKey)!.push({ deviceUserId, punchTime, state })
    }

    // Sort each day's punches chronologically
    for (const arr of byUserDay.values()) {
      arr.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
    }

    for (const { deviceUserId, punchTime, state } of parsed) {
      // Determine punch type: device state 0/4 = in, 1/5 = out
      // If state is ambiguous (some devices always send 0), fall back to position in day
      let punchType: string
      if (state === 0 || state === 4) {
        punchType = 'in'
      } else if (state === 1 || state === 5) {
        punchType = 'out'
      } else {
        // Infer from position in day (odd=in, even=out)
        const dayKey = `${deviceUserId}|${punchTime.toISOString().slice(0, 10)}`
        const dayPunches = byUserDay.get(dayKey) || []
        const idx = dayPunches.findIndex(
          (p) => Math.abs(p.punchTime.getTime() - punchTime.getTime()) < 1000
        )
        punchType = idx % 2 === 0 ? 'in' : 'out'
      }

      // Skip duplicates
      const existing = await prisma.attendanceLog.findFirst({
        where: {
          deviceUserId,
          punchTime: {
            gte: new Date(punchTime.getTime() - 1000),
            lte: new Date(punchTime.getTime() + 1000)
          }
        }
      })
      if (existing) continue

      const staffMatch = staffMap.get(deviceUserId)
      await prisma.attendanceLog.create({
        data: {
          staffId: staffMatch?.id ?? null,
          deviceUserId,
          deviceUserName: staffMatch?.name ?? null,
          punchTime,
          punchType,
          source: `adms:${sn}`
        }
      })
      created++
    }

    console.log(`[ADMS] SN=${sn} processed ${parsed.length} records, created ${created} new`)
    return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  } catch (error) {
    console.error('[ADMS] Error:', error)
    // Always return OK to device so it doesn't retry infinitely
    return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
}
