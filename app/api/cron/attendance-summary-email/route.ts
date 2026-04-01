/**
 * Daily cron: attendance summary for the previous calendar day (EOD timezone) —
 * per-staff hours & punches that day, plus pay-period-to-date hours.
 * Secure with CRON_SECRET (same as other crons).
 *
 * Example: schedule after close, same as end-of-day-email, e.g. "0 13 * * *" UTC.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import {
  ATTENDANCE_SUMMARY_EMAIL_ENABLED_KEY,
  ATTENDANCE_SUMMARY_EMAIL_RECIPIENTS_KEY,
  ATTENDANCE_SUMMARY_EMAIL_LAST_SENT_KEY,
  buildAttendanceSummaryEmailHtml,
  parseRecipientEmails
} from '@/lib/attendance-summary-email'
import { buildAttendanceSummaryData } from '@/lib/attendance-summary-data'
import { DEFAULT_EOD_TIMEZONE, getReportDateYmd } from '@/lib/eod-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EOD_TZ_KEY = 'eod_email_timezone'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rowEnabled = await prisma.appSettings.findUnique({
      where: { key: ATTENDANCE_SUMMARY_EMAIL_ENABLED_KEY }
    })
    if (rowEnabled?.value !== 'true') {
      return NextResponse.json({ skipped: true, reason: 'disabled' })
    }

    const rowRecipients = await prisma.appSettings.findUnique({
      where: { key: ATTENDANCE_SUMMARY_EMAIL_RECIPIENTS_KEY }
    })
    const emails = parseRecipientEmails(rowRecipients?.value ?? '')
    if (emails.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'no_recipients' })
    }

    const rowTz = await prisma.appSettings.findUnique({ where: { key: EOD_TZ_KEY } })
    const timeZone =
      rowTz?.value?.trim() || process.env.EOD_EMAIL_TIMEZONE?.trim() || DEFAULT_EOD_TIMEZONE
    const reportDate = getReportDateYmd(timeZone)

    const rowLast = await prisma.appSettings.findUnique({
      where: { key: ATTENDANCE_SUMMARY_EMAIL_LAST_SENT_KEY }
    })
    if (rowLast?.value === reportDate) {
      return NextResponse.json({ skipped: true, reason: 'already_sent', reportDate })
    }

    const data = await buildAttendanceSummaryData(reportDate, timeZone)
    const html = buildAttendanceSummaryEmailHtml({
      reportDateYmd: data.reportDateYmd,
      periodStartYmd: data.periodStartYmd,
      periodLabel: data.periodLabel,
      timeZone,
      rows: data.rows
    })
    const subject = `Attendance summary — ${reportDate}`

    const errors: string[] = []
    for (const to of emails) {
      try {
        await sendMail({ to, subject, html })
      } catch (e) {
        errors.push(`${to}: ${e instanceof Error ? e.message : 'error'}`)
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'One or more sends failed', details: errors, reportDate },
        { status: 500 }
      )
    }

    await prisma.appSettings.upsert({
      where: { key: ATTENDANCE_SUMMARY_EMAIL_LAST_SENT_KEY },
      update: { value: reportDate },
      create: { key: ATTENDANCE_SUMMARY_EMAIL_LAST_SENT_KEY, value: reportDate }
    })

    return NextResponse.json({
      ok: true,
      reportDate,
      sent: emails.length
    })
  } catch (e) {
    console.error('cron attendance-summary-email', e)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
