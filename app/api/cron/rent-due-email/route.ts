/**
 * Daily cron: email rent-due recipients when no Rent invoice exists for the month
 * (from the 2nd onward). Secure with CRON_SECRET (Bearer), same as other crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runRentDueEmailJob } from '@/lib/rent-due'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await runRentDueEmailJob()
    if (result.errors && result.errors.length > 0) {
      return NextResponse.json(
        { error: 'One or more sends failed', ...result },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('cron rent-due-email', e)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
