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

export const dynamic = 'force-dynamic'

const TZ_KEY = 'eod_email_timezone'

function getTimezone(): string {
  return process.env.EOD_EMAIL_TIMEZONE?.trim() || DEFAULT_EOD_TIMEZONE
}

async function readSettings() {
  const rowEnabled = await prisma.appSettings.findUnique({ where: { key: EOD_EMAIL_ENABLED_KEY } })
  const rowRecipients = await prisma.appSettings.findUnique({ where: { key: EOD_EMAIL_RECIPIENTS_KEY } })
  const rowLast = await prisma.appSettings.findUnique({ where: { key: EOD_EMAIL_LAST_SENT_KEY } })
  const rowTz = await prisma.appSettings.findUnique({ where: { key: TZ_KEY } })
  return {
    enabled: rowEnabled?.value === 'true',
    recipients: rowRecipients?.value ?? '',
    lastSentDate: rowLast?.value ?? '',
    timeZone: rowTz?.value?.trim() || getTimezone()
  }
}

/** GET — current end-of-day email settings */
export async function GET() {
  try {
    const s = await readSettings()
    return NextResponse.json(s)
  } catch (e) {
    console.error('end-of-day-email GET', e)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

/**
 * POST — save settings: { enabled?, recipients?, timeZone? }
 * Or send test: { sendTest: true }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const sendTest = body.sendTest === true

    if (sendTest) {
      const s = await readSettings()
      const emails = parseRecipientEmails(s.recipients)
      if (emails.length === 0) {
        return NextResponse.json({ error: 'Add at least one valid email address' }, { status: 400 })
      }
      const tz = s.timeZone || getTimezone()
      const reportDate = getReportDateYmd(tz)
      const reports = await buildDayReports()
      const report = reports.find((r) => r.date === reportDate) ?? null
      const baseUrl = getPublicAppUrlFromEnv()
      const html = buildEndOfDayEmailHtml(report, reportDate, baseUrl)
      const subject = `End of day — ${reportDate} (test)`
      for (const to of emails) {
        await sendMail({ to, subject, html })
      }
      return NextResponse.json({ ok: true, sent: emails.length, reportDate })
    }

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined
    const recipients = typeof body.recipients === 'string' ? body.recipients : undefined
    const timeZone =
      typeof body.timeZone === 'string' && body.timeZone.trim() ? body.timeZone.trim() : undefined

    if (enabled === undefined && recipients === undefined && timeZone === undefined) {
      return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
    }

    if (enabled !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: EOD_EMAIL_ENABLED_KEY },
        update: { value: enabled ? 'true' : 'false' },
        create: { key: EOD_EMAIL_ENABLED_KEY, value: enabled ? 'true' : 'false' }
      })
    }

    if (recipients !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: EOD_EMAIL_RECIPIENTS_KEY },
        update: { value: recipients },
        create: { key: EOD_EMAIL_RECIPIENTS_KEY, value: recipients }
      })
    }

    if (timeZone !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: TZ_KEY },
        update: { value: timeZone },
        create: { key: TZ_KEY, value: timeZone }
      })
    }

    const s = await readSettings()
    return NextResponse.json(s)
  } catch (e) {
    console.error('end-of-day-email POST', e)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
