import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/email'
import { parseRecipientEmails } from '@/lib/eod-email'
import { buildOverShortEmail } from '@/lib/over-short-report'
import { loadOverShortReport, resolveOverShortRange } from '@/lib/over-short-report-data'
import { getPublicAppUrlFromEnv } from '@/lib/public-url'

export const dynamic = 'force-dynamic'

const MAX_RECIPIENTS = 10

/**
 * POST { from, to, recipients } — email the over/short report for a range.
 * The report is rebuilt here from the database, so what is sent is never taken from the browser.
 * `recipients` is one or more addresses separated by commas, spaces or semicolons.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      from?: unknown
      to?: unknown
      recipients?: unknown
    }

    const range = resolveOverShortRange(
      typeof body.from === 'string' ? body.from : null,
      typeof body.to === 'string' ? body.to : null
    )
    if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 })

    const recipients = parseRecipientEmails(typeof body.recipients === 'string' ? body.recipients : '')
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Add at least one valid email address.' }, { status: 400 })
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Send to ${MAX_RECIPIENTS} addresses or fewer.` }, { status: 400 })
    }

    const report = await loadOverShortReport(range.from, range.to)
    const email = buildOverShortEmail(report, getPublicAppUrlFromEnv())

    await sendMail({
      to: recipients.join(', '),
      subject: email.subject,
      html: email.html,
      text: email.text
    })

    return NextResponse.json({ success: true, sentTo: recipients, subject: email.subject })
  } catch (error) {
    console.error('over-short report email', error)
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json(
      { error: message.startsWith('Email not configured') ? message : 'Could not send the email.' },
      { status: 500 }
    )
  }
}
