import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Keys that are allowed to be read/written via this endpoint
const ALLOWED_KEYS = [
  'zk_device_ip',
  'zk_device_port',
  'agent_secret',
  'zk_adms_enabled'
]

/**
 * GET /api/settings?keys=zk_device_ip,zk_device_port
 * Returns the requested settings keys from DB (and falls back to env vars for device config).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keysParam = searchParams.get('keys')
    const keys = keysParam ? keysParam.split(',').filter((k) => ALLOWED_KEYS.includes(k)) : ALLOWED_KEYS

    const rows = await prisma.appSettings.findMany({
      where: { key: { in: keys } }
    })

    const result: Record<string, string> = {}

    // Default fallbacks from env vars
    const envFallback: Record<string, string | undefined> = {
      zk_device_ip: process.env.ZK_DEVICE_IP,
      zk_device_port: process.env.ZK_DEVICE_PORT,
      agent_secret: process.env.AGENT_SECRET
    }

    for (const key of keys) {
      const row = rows.find((r) => r.key === key)
      if (row) {
        // Mask agent_secret in GET response
        result[key] = key === 'agent_secret' ? '***' : row.value
      } else if (envFallback[key]) {
        result[key] = key === 'agent_secret' ? '***' : envFallback[key]!
      } else {
        result[key] = ''
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

/**
 * POST /api/settings
 * Body: { key: string, value: string } or { settings: Record<string, string> }
 * Upserts one or more settings values.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Support both single { key, value } and batch { settings: { key: value } }
    const toSave: Array<{ key: string; value: string }> = []

    if (body.settings && typeof body.settings === 'object') {
      for (const [key, value] of Object.entries(body.settings)) {
        if (ALLOWED_KEYS.includes(key)) {
          toSave.push({ key, value: String(value) })
        }
      }
    } else if (body.key && ALLOWED_KEYS.includes(body.key)) {
      toSave.push({ key: body.key, value: String(body.value ?? '') })
    }

    if (toSave.length === 0) {
      return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
    }

    for (const { key, value } of toSave) {
      // Don't overwrite agent_secret with the masked placeholder
      if (key === 'agent_secret' && value === '***') continue

      await prisma.appSettings.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      })
    }

    return NextResponse.json({ saved: toSave.map((s) => s.key) })
  } catch (error) {
    console.error('Settings POST error:', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
