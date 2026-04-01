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

const EOD_TZ_KEY = 'eod_email_timezone'

function getTimezoneFromEnv(): string {
  return process.env.EOD_EMAIL_TIMEZONE?.trim() || DEFAULT_EOD_TIMEZONE
}

async function readTimeZone(): Promise<string> {
  const rowTz = await prisma.appSettings.findUnique({ where: { key: EOD_TZ_KEY } })
  return rowTz?.value?.trim() || getTimezoneFromEnv()
}

async function readSettings() {
  const rowEnabled = await prisma.appSettings.findUnique({
    where: { key: ATTENDANCE_SUMMARY_EMAIL_ENABLED_KEY }
  })
  const rowRecipients = await prisma.appSettings.findUnique({
    where: { key: ATTENDANCE_SUMMARY_EMAIL_RECIPIENTS_KEY }
  })
  const rowLast = await prisma.appSettings.findUnique({
    where: { key: ATTENDANCE_SUMMARY_EMAIL_LAST_SENT_KEY }
  })
  return {
    enabled: rowEnabled?.value === 'true',
    recipients: rowRecipients?.value ?? '',
    lastSentDate: rowLast?.value ?? '',
    timeZone: await readTimeZone()
  }
}

/** GET — attendance summary email settings (timeZone reads shared app key `eod_email_timezone`). */
export async function GET() {
  try {
    const s = await readSettings()
    return NextResponse.json(s)
  } catch (e) {
    console.error('attendance-summary-email GET', e)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

/**
 * POST — save: { enabled?, recipients? }
 * Or test: { sendTest: true, recipients?, timeZone? } — timeZone overrides for test (else stored EOD timezone).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const sendTest = body.sendTest === true

    if (sendTest) {
      const s = await readSettings()
      const draftRecipients =
        typeof body.recipients === 'string' ? body.recipients : s.recipients
      const emails = parseRecipientEmails(draftRecipients)
      if (emails.length === 0) {
        return NextResponse.json({ error: 'Add at least one valid email address' }, { status: 400 })
      }
      const draftTz =
        typeof body.timeZone === 'string' && body.timeZone.trim()
          ? body.timeZone.trim()
          : s.timeZone || getTimezoneFromEnv()
      const reportDate = getReportDateYmd(draftTz)
      const data = await buildAttendanceSummaryData(reportDate, draftTz)
      const html = buildAttendanceSummaryEmailHtml({
        reportDateYmd: data.reportDateYmd,
        periodStartYmd: data.periodStartYmd,
        periodLabel: data.periodLabel,
        timeZone: draftTz,
        rows: data.rows
      })
      const subject = `Attendance summary — ${reportDate} (test)`
      for (const to of emails) {
        await sendMail({ to, subject, html })
      }
      return NextResponse.json({ ok: true, sent: emails.length, reportDate })
    }

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined
    const recipients = typeof body.recipients === 'string' ? body.recipients : undefined

    if (enabled === undefined && recipients === undefined) {
      return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
    }

    if (enabled !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: ATTENDANCE_SUMMARY_EMAIL_ENABLED_KEY },
        update: { value: enabled ? 'true' : 'false' },
        create: { key: ATTENDANCE_SUMMARY_EMAIL_ENABLED_KEY, value: enabled ? 'true' : 'false' }
      })
    }

    if (recipients !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: ATTENDANCE_SUMMARY_EMAIL_RECIPIENTS_KEY },
        update: { value: recipients },
        create: { key: ATTENDANCE_SUMMARY_EMAIL_RECIPIENTS_KEY, value: recipients }
      })
    }

    const s = await readSettings()
    return NextResponse.json(s)
  } catch (e) {
    console.error('attendance-summary-email POST', e)
    return NextResponse.json({ error: 'Failed to save or send' }, { status: 500 })
  }
}
