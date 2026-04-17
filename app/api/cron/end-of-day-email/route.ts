/**
 * Daily cron: send automated End of Day summary email for the previous calendar day
 * (in the configured timezone). Secure with CRON_SECRET (same as /api/reminders/check).
 *
 * When this route succeeds (including skipped responses), it also runs the attendance summary
 * email job so one scheduled GET can cover both features.
 *
 * Example Vercel cron (after 8am America/St_Lucia): path: /api/cron/end-of-day-email, schedule: "0 13 * * *" (UTC)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { getPublicAppUrlFromEnv } from '@/lib/public-url'
import { buildDayReports } from '@/lib/day-reports'
import {
  EOD_EMAIL_ENABLED_KEY,
  EOD_EMAIL_RECIPIENTS_KEY,
  EOD_EMAIL_LAST_SENT_KEY,
  DEFAULT_EOD_TIMEZONE,
  getReportDateYmd,
  parseRecipientEmails,
  buildEndOfDayEmailHtml
} from '@/lib/eod-email'
import { runAttendanceSummaryEmailJob } from '@/lib/run-attendance-summary-email-job'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TZ_KEY = 'eod_email_timezone'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let eodJson: Record<string, unknown>
    let status = 200

    const rowEnabled = await prisma.appSettings.findUnique({ where: { key: EOD_EMAIL_ENABLED_KEY } })
    if (rowEnabled?.value !== 'true') {
      eodJson = { skipped: true, reason: 'disabled' }
    } else {
      const rowRecipients = await prisma.appSettings.findUnique({ where: { key: EOD_EMAIL_RECIPIENTS_KEY } })
      const emails = parseRecipientEmails(rowRecipients?.value ?? '')
      if (emails.length === 0) {
        eodJson = { skipped: true, reason: 'no_recipients' }
      } else {
        const rowTz = await prisma.appSettings.findUnique({ where: { key: TZ_KEY } })
        const timeZone =
          rowTz?.value?.trim() || process.env.EOD_EMAIL_TIMEZONE?.trim() || DEFAULT_EOD_TIMEZONE
        const reportDate = getReportDateYmd(timeZone)

        const rowLast = await prisma.appSettings.findUnique({ where: { key: EOD_EMAIL_LAST_SENT_KEY } })
        if (rowLast?.value === reportDate) {
          eodJson = { skipped: true, reason: 'already_sent', reportDate }
        } else {
          const reports = await buildDayReports()
          const report = reports.find((r) => r.date === reportDate) ?? null
          const baseUrl = getPublicAppUrlFromEnv()
          const html = buildEndOfDayEmailHtml(report, reportDate, baseUrl)
          const subject = `End of day — ${reportDate}`

          const errors: string[] = []
          for (const to of emails) {
            try {
              await sendMail({ to, subject, html })
            } catch (e) {
              errors.push(`${to}: ${e instanceof Error ? e.message : 'error'}`)
            }
          }

          if (errors.length > 0) {
            eodJson = { error: 'One or more sends failed', details: errors, reportDate }
            status = 500
          } else {
            await prisma.appSettings.upsert({
              where: { key: EOD_EMAIL_LAST_SENT_KEY },
              update: { value: reportDate },
              create: { key: EOD_EMAIL_LAST_SENT_KEY, value: reportDate }
            })
            eodJson = { ok: true, reportDate, sent: emails.length }
          }
        }
      }
    }

    const attendanceSummary = await runAttendanceSummaryEmailJob()

    return NextResponse.json({ ...eodJson, attendanceSummary }, { status })
  } catch (e) {
    console.error('cron end-of-day-email', e)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
