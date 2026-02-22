import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** POST /api/attendance/sync
 * Connects to ZKTeco device, pulls attendance logs, stores in DB.
 * Requires ZK_DEVICE_IP (and optionally ZK_DEVICE_PORT) in env.
 */
async function getDeviceConfig(): Promise<{ ip: string; port: number }> {
  // DB settings take priority over environment variables
  const rows = await prisma.appSettings.findMany({
    where: { key: { in: ['zk_device_ip', 'zk_device_port'] } }
  })
  const dbIp = rows.find((r) => r.key === 'zk_device_ip')?.value || ''
  const dbPort = rows.find((r) => r.key === 'zk_device_port')?.value || ''

  const ip = dbIp || process.env.ZK_DEVICE_IP || ''
  const port = parseInt(dbPort || process.env.ZK_DEVICE_PORT || '4370', 10)
  return { ip, port }
}

export async function POST(request: NextRequest) {
  try {
    const { ip, port } = await getDeviceConfig()

    if (!ip) {
      return NextResponse.json(
        {
          error: 'Device IP not configured.',
          hint: 'Go to Attendance → Device Management → Device Settings to add your ZKTeco device IP. Note: direct sync only works when the app is running on the same local network as the device. Use the Windows Agent or ADMS for cloud sync.'
        },
        { status: 400 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ZKAttendanceClient = require('zk-attendance-sdk')
    const client = new ZKAttendanceClient(ip, port, 5000, 5200)

    await client.createSocket()

    const { data: rawLogs } = await client.getAttendances()
    await client.disconnect()

    if (!rawLogs || !Array.isArray(rawLogs)) {
      return NextResponse.json({ error: 'No attendance data from device', synced: 0 }, { status: 500 })
    }

    // Build staff lookup: deviceUserId -> Staff
    const staff = await prisma.staff.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, deviceUserId: true }
    })
    const staffByDeviceId = new Map<string | null, { id: string; name: string }>()
    for (const s of staff) {
      if (s.deviceUserId) staffByDeviceId.set(s.deviceUserId.trim(), { id: s.id, name: s.name })
    }

    // Parse and infer in/out: for each user per day, sort by time; odd index = in, even = out
    const byUserDay = new Map<string, Array<{ deviceUserId: string; recordTime: Date }>>()
    for (const r of rawLogs) {
      const deviceUserId = String(r.deviceUserId || r.userId || '').trim()
      if (!deviceUserId) continue
      const recordTime = typeof r.recordTime === 'string' ? new Date(r.recordTime) : new Date(r.recordTime)
      const key = `${deviceUserId}|${recordTime.toISOString().slice(0, 10)}`
      if (!byUserDay.has(key)) byUserDay.set(key, [])
      byUserDay.get(key)!.push({ deviceUserId, recordTime })
    }

    for (const arr of byUserDay.values()) {
      arr.sort((a, b) => a.recordTime.getTime() - b.recordTime.getTime())
    }

    let created = 0
    const seen = new Set<string>()

    for (const r of rawLogs) {
      const deviceUserId = String(r.deviceUserId || r.userId || '').trim()
      if (!deviceUserId) continue
      const recordTime = typeof r.recordTime === 'string' ? new Date(r.recordTime) : new Date(r.recordTime)
      const dateKey = recordTime.toISOString().slice(0, 10)
      const key = `${deviceUserId}|${dateKey}`
      const dayPunches = byUserDay.get(key) || []
      const idx = dayPunches.findIndex((p) => Math.abs(p.recordTime.getTime() - recordTime.getTime()) < 1000)
      const punchType = idx % 2 === 0 ? 'in' : 'out'

      const dedupeKey = `${deviceUserId}|${recordTime.getTime()}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      // Skip if we already have this punch (avoid duplicates on re-sync)
      const existing = await prisma.attendanceLog.findFirst({
        where: {
          deviceUserId,
          punchTime: {
            gte: new Date(recordTime.getTime() - 1000),
            lte: new Date(recordTime.getTime() + 1000)
          }
        }
      })
      if (existing) continue

      const staffMatch = staffByDeviceId.get(deviceUserId)
      const deviceUserName = null // SDK doesn't return name in log; could fetch from getUsers if needed

      await prisma.attendanceLog.create({
        data: {
          staffId: staffMatch?.id ?? null,
          deviceUserId,
          deviceUserName: staffMatch?.name ?? deviceUserName,
          punchTime: recordTime,
          punchType,
          source: 'zkteco'
        }
      })
      created++
    }

    return NextResponse.json({ synced: created, totalFromDevice: rawLogs.length })
  } catch (error) {
    console.error('Attendance sync error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to sync from device'
    return NextResponse.json(
      { error: msg, hint: 'Ensure ZK_DEVICE_IP is correct and the device is reachable on your network.' },
      { status: 500 }
    )
  }
}
