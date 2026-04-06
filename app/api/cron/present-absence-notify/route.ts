/**
 * Cron: email / WhatsApp when scheduled staff are past the grace window with no punch (same calendar day).
 * Secure with CRON_SECRET. Schedule every 15–30 minutes during working hours if desired.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runPresentAbsenceNotifications } from '@/lib/present-absence-notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await runPresentAbsenceNotifications()
    return NextResponse.json(result)
  } catch (e) {
    console.error('cron present-absence-notify', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500 }
    )
  }
}
