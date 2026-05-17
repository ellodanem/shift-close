import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { canManagePublicHolidaySettings } from '@/lib/roles'
import { parseMinOffDaysPerWeek, ROSTER_MIN_OFF_DAYS_PER_WEEK_KEY } from '@/lib/roster-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const row = await prisma.appSettings.findUnique({
      where: { key: ROSTER_MIN_OFF_DAYS_PER_WEEK_KEY }
    })
    const minOffDaysPerWeek = parseMinOffDaysPerWeek(row?.value)
    return NextResponse.json({ minOffDaysPerWeek })
  } catch (e) {
    console.error('roster settings GET', e)
    return NextResponse.json({ error: 'Failed to load roster settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !canManagePublicHolidaySettings(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = (await request.json()) as { minOffDaysPerWeek?: number | string }
    const parsed = parseMinOffDaysPerWeek(
      body.minOffDaysPerWeek !== undefined ? String(body.minOffDaysPerWeek) : undefined
    )
    const value = String(parsed)
    await prisma.appSettings.upsert({
      where: { key: ROSTER_MIN_OFF_DAYS_PER_WEEK_KEY },
      update: { value },
      create: { key: ROSTER_MIN_OFF_DAYS_PER_WEEK_KEY, value }
    })
    return NextResponse.json({ minOffDaysPerWeek: parsed })
  } catch (e) {
    console.error('roster settings POST', e)
    return NextResponse.json({ error: 'Failed to save roster settings' }, { status: 500 })
  }
}
