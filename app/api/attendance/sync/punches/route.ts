import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

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

type DevicePunch = {
  key: string
  deviceUserId: string
  recordTime: string
  state?: number
}

export async function GET(request: NextRequest) {
  try {
    const { ip, port } = await getDeviceConfig()
    if (!ip) {
      return NextResponse.json(
        {
          ok: false,
          punches: [],
          error: 'Device IP not configured. Set it in Attendance > Device Management.'
        },
        { status: 400 }
      )
    }

    if (process.env.VERCEL && isPrivateLanIp(ip)) {
      return NextResponse.json(
        {
          ok: false,
          punches: [],
          error:
            'Cannot load punches from cloud: device IP is private. Use local app on same LAN, Windows Agent, or ADMS.'
        },
        { status: 400 }
      )
    }

    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') || '2000', 10)
    const cap = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 2000, 1), 10000)

    const ZKAttendanceClient = require('zk-attendance-sdk')
    const client = new ZKAttendanceClient(ip, port, 5000, 5200)
    await client.createSocket()
    const { data: rawLogs } = await client.getAttendances()
    await client.disconnect()

    if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
      return NextResponse.json({ ok: true, punches: [], totalOnDevice: 0 })
    }

    const seen = new Set<string>()
    const normalized: DevicePunch[] = []
    for (const r of rawLogs) {
      const deviceUserId = String(r.deviceUserId || r.userId || '').trim()
      if (!deviceUserId) continue
      const dt = new Date(r.recordTime || r.attTime || 0)
      if (Number.isNaN(dt.getTime())) continue
      const key = `${deviceUserId}|${dt.getTime()}`
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push({
        key,
        deviceUserId,
        recordTime: dt.toISOString(),
        state: typeof r.state === 'number' ? r.state : undefined
      })
    }

    normalized.sort((a, b) => new Date(b.recordTime).getTime() - new Date(a.recordTime).getTime())

    return NextResponse.json({
      ok: true,
      punches: normalized.slice(0, cap),
      totalOnDevice: normalized.length
    })
  } catch (error) {
    console.error('Attendance sync punches load error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to load punches from device'
    return NextResponse.json({ ok: false, punches: [], error: msg }, { status: 500 })
  }
}
