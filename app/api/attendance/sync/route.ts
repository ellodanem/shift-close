import { NextRequest, NextResponse } from 'next/server'
import { ingestAttendanceBatch, type IngestLogLine } from '@/lib/attendance-ingest-shared'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** True if IP is RFC1918 / loopback (not reachable from Vercel’s cloud). */
function isPrivateLanIp(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim())
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 127) return true
  return false
}

async function getDeviceConfig(): Promise<{ ip: string; port: number }> {
  const rows = await prisma.appSettings.findMany({
    where: { key: { in: ['zk_device_ip', 'zk_device_port'] } }
  })
  const dbIp = rows.find((r) => r.key === 'zk_device_ip')?.value || ''
  const dbPort = rows.find((r) => r.key === 'zk_device_port')?.value || ''

  const ip = dbIp || process.env.ZK_DEVICE_IP || ''
  const port = parseInt(dbPort || process.env.ZK_DEVICE_PORT || '4370', 10)
  return { ip, port }
}

/** POST /api/attendance/sync
 * Connects to ZKTeco device, pulls attendance logs, stores in DB.
 */
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

    if (process.env.VERCEL && isPrivateLanIp(ip)) {
      return NextResponse.json(
        {
          error: 'Cannot sync from the cloud: the device is on a private network.',
          hint:
            'This button runs on Vercel’s servers, which cannot reach 192.168.x.x or similar. Configure ADMS on the device so punches push to this app, or use the Windows Agent on a PC at the station. Use “Sync from device” only when the app runs on the same LAN (e.g. local Next.js on your PC).'
        },
        { status: 400 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ZKAttendanceClient = require('zk-attendance-sdk')
    const client = new ZKAttendanceClient(ip, port, 5000, 5200)

    await client.createSocket()

    const { data: rawLogs } = await client.getAttendances()
    await client.disconnect()

    if (!rawLogs || !Array.isArray(rawLogs)) {
      return NextResponse.json({ error: 'No attendance data from device', synced: 0 }, { status: 500 })
    }

    const receivedAt = new Date()
    const seen = new Set<string>()
    const logs: IngestLogLine[] = []

    for (const r of rawLogs) {
      const deviceUserId = String(r.deviceUserId || r.userId || '').trim()
      if (!deviceUserId) continue
      const recordTimeRaw = r.recordTime
      const recordTime =
        typeof recordTimeRaw === 'string' ? recordTimeRaw : new Date(recordTimeRaw as Date)
      const probe =
        typeof recordTimeRaw === 'string' ? new Date(recordTimeRaw) : new Date(recordTimeRaw as Date)
      if (Number.isNaN(probe.getTime())) continue
      const dedupeKey = `${deviceUserId}|${probe.getTime()}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      logs.push({ deviceUserId, recordTime })
    }

    const { synced, total, bulk } = await ingestAttendanceBatch({
      logs,
      receivedAt,
      deviceSerial: null,
      source: 'zkteco',
      allowLearn: false
    })

    return NextResponse.json({ synced, totalFromDevice: rawLogs.length, processed: total, bulk })
  } catch (error) {
    console.error('Attendance sync error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to sync from device'
    const hint = process.env.VERCEL
      ? 'On Vercel, the server usually cannot open a TCP connection to a local device IP. Use ADMS (real-time push) or the Windows Agent on a PC at the station. For “Sync from device”, run the app locally on the same network as the ZKTeco.'
      : 'Ensure the device IP and port are correct and the device is reachable from this machine (same network or routed).'
    return NextResponse.json({ error: msg, hint }, { status: 500 })
  }
}
