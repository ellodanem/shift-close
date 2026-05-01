import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizePublicAppUrl } from '@/lib/public-url'

export const dynamic = 'force-dynamic'

// Keys that are allowed to be read/written via this endpoint
const ALLOWED_KEYS = [
  'zk_device_ip',
  'zk_device_port',
  'agent_secret',
  'zk_adms_enabled',
  'public_app_url',
  'attendance_clock_normalize_apply',
  'attendance_clock_normalize_learn',
  'attendance_clock_min_samples',
  'attendance_clock_delta_spread_max_minutes',
  'attendance_clock_bulk_line_threshold',
  'attendance_clock_bulk_time_span_minutes',
  'attendance_clock_allowed_serials',
  'attendance_clock_device_serial_for_agent',
  'attendance_clock_pending_max',
  'attendance_clock_max_sample_delta_abs_minutes'
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
      agent_secret: process.env.AGENT_SECRET,
      public_app_url:
        process.env.APP_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}` : undefined)
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
      if (key === 'public_app_url' && result[key] && result[key] !== '***') {
        result[key] = normalizePublicAppUrl(result[key])
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

      const normalized =
        key === 'public_app_url' ? normalizePublicAppUrl(String(value ?? '')) : String(value ?? '')

      await prisma.appSettings.upsert({
        where: { key },
        update: { value: normalized },
        create: { key, value: normalized }
      })
    }

    return NextResponse.json({ saved: toSave.map((s) => s.key) })
  } catch (error) {
    console.error('Settings POST error:', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
