/**
 * Daily cron: delete page visit rows older than the retention window.
 * Secure with CRON_SECRET (Bearer), same as other crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { PAGE_VISIT_RETENTION_DAYS, prunePageVisits } from '@/lib/login-audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const deleted = await prunePageVisits()
    return NextResponse.json({ ok: true, deleted, retentionDays: PAGE_VISIT_RETENTION_DAYS })
  } catch (e) {
    console.error('cron prune-page-visits', e)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
