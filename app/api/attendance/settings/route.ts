import { NextRequest, NextResponse } from 'next/server'
import { parseExpectedPunchesPerDay } from '@/lib/attendance-irregularity'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const KEY = 'attendance_expected_punches_per_day'

/** GET — expected punches per day for irregularity checks (default 4). */
export async function GET() {
  try {
    const row = await prisma.appSettings.findUnique({ where: { key: KEY } })
    return NextResponse.json({
      expectedPunchesPerDay: parseExpectedPunchesPerDay(row?.value)
    })
  } catch (e) {
    console.error('attendance settings GET', e)
    return NextResponse.json({ error: 'Failed to load attendance settings' }, { status: 500 })
  }
}

/** POST body: { expectedPunchesPerDay: number } — integer 1–24. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const raw = (body as { expectedPunchesPerDay?: unknown }).expectedPunchesPerDay
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
    if (!Number.isFinite(n) || n < 1 || n > 24) {
      return NextResponse.json({ error: 'expectedPunchesPerDay must be between 1 and 24' }, { status: 400 })
    }

    await prisma.appSettings.upsert({
      where: { key: KEY },
      update: { value: String(n) },
      create: { key: KEY, value: String(n) }
    })

    return NextResponse.json({ expectedPunchesPerDay: n })
  } catch (e) {
    console.error('attendance settings POST', e)
    return NextResponse.json({ error: 'Failed to save attendance settings' }, { status: 500 })
  }
}
