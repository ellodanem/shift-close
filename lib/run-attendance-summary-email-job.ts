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

const EOD_TZ_KEY = 'eod_email_timezone'

export type AttendanceSummaryEmailJobResult =
  | { ok: true; reportDate: string; sent: number }
  | { skipped: true; reason: 'disabled' | 'no_recipients' | 'already_sent'; reportDate?: string }
  | { error: string; details?: string[]; reportDate?: string }

/**
 * Sends the daily attendance summary when enabled and not already sent for the report date.
 * Used by GET /api/cron/attendance-summary-email and chained from end-of-day-email cron.
 */
export async function runAttendanceSummaryEmailJob(): Promise<AttendanceSummaryEmailJobResult> {
  try {
    const rowEnabled = await prisma.appSettings.findUnique({
      where: { key: ATTENDANCE_SUMMARY_EMAIL_ENABLED_KEY }
    })
    if (rowEnabled?.value !== 'true') {
      return { skipped: true, reason: 'disabled' }
    }

    const rowRecipients = await prisma.appSettings.findUnique({
      where: { key: ATTENDANCE_SUMMARY_EMAIL_RECIPIENTS_KEY }
    })
    const emails = parseRecipientEmails(rowRecipients?.value ?? '')
    if (emails.length === 0) {
      return { skipped: true, reason: 'no_recipients' }
    }

    const rowTz = await prisma.appSettings.findUnique({ where: { key: EOD_TZ_KEY } })
    const timeZone =
      rowTz?.value?.trim() || process.env.EOD_EMAIL_TIMEZONE?.trim() || DEFAULT_EOD_TIMEZONE
    const reportDate = getReportDateYmd(timeZone)

    const rowLast = await prisma.appSettings.findUnique({
      where: { key: ATTENDANCE_SUMMARY_EMAIL_LAST_SENT_KEY }
    })
    if (rowLast?.value === reportDate) {
      return { skipped: true, reason: 'already_sent', reportDate }
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
      return {
        error: 'One or more sends failed',
        details: errors,
        reportDate
      }
    }

    await prisma.appSettings.upsert({
      where: { key: ATTENDANCE_SUMMARY_EMAIL_LAST_SENT_KEY },
      update: { value: reportDate },
      create: { key: ATTENDANCE_SUMMARY_EMAIL_LAST_SENT_KEY, value: reportDate }
    })

    return { ok: true, reportDate, sent: emails.length }
  } catch (e) {
    console.error('runAttendanceSummaryEmailJob', e)
    return { error: 'Cron failed' }
  }
}
