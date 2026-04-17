/**
 * Daily cron: attendance summary for the previous calendar day (EOD timezone) —
 * per-staff hours & punches that day, plus pay-period-to-date hours.
 * Secure with CRON_SECRET (same as other crons).
 *
 * Also runs automatically after a successful end-of-day-email cron when attendance summary is enabled,
 * so you do not need a separate scheduler if you already call /api/cron/end-of-day-email.
 *
 * Example: schedule after close, same as end-of-day-email, e.g. "0 13 * * *" UTC.
 */
import { NextRequest, NextResponse } from 'next/server'
import { runAttendanceSummaryEmailJob } from '@/lib/run-attendance-summary-email-job'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await runAttendanceSummaryEmailJob()
    if ('ok' in result && result.ok) {
      return NextResponse.json({
        ok: true,
        reportDate: result.reportDate,
        sent: result.sent
      })
    }
    if ('skipped' in result && result.skipped) {
      return NextResponse.json({
        skipped: true,
        reason: result.reason,
        ...(result.reportDate ? { reportDate: result.reportDate } : {})
      })
    }
    const failed = result as Extract<typeof result, { error: string }>
    return NextResponse.json(
      {
        error: failed.error,
        ...(failed.details ? { details: failed.details } : {}),
        ...(failed.reportDate ? { reportDate: failed.reportDate } : {})
      },
      { status: 500 }
    )
  } catch (e) {
    console.error('cron attendance-summary-email', e)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
