/**
 * Daily reminder while the harvest agent is paused/offline or customer data has gone stale.
 * The agent only emails once when it pauses; this repeats until someone resumes it.
 * Uses the harvest agent email settings. Secure with CRON_SECRET (Bearer), same as other crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/email'
import { parseRecipientEmails } from '@/lib/eod-email'
import { getPublicAppUrlFromEnv } from '@/lib/public-url'
import { readHarvestEmailSettings } from '@/lib/harvest-agent-email'
import { getHarvestHealth } from '@/lib/harvest-health'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const health = await getHarvestHealth()
    if (health.level === 'ok' || !health.message) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'healthy' })
    }

    const settings = await readHarvestEmailSettings()
    if (!settings.enabled) {
      return NextResponse.json({ skipped: true, reason: 'email_disabled', level: health.level })
    }
    const recipients = parseRecipientEmails(settings.recipients)
    if (recipients.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'no_recipients', level: health.level })
    }

    const baseUrl = getPublicAppUrlFromEnv()
    const settingsUrl = baseUrl ? `${baseUrl}/settings/harvest-agent` : '/settings/harvest-agent'
    const subject = health.agentPaused
      ? 'Reminder: harvest agent is still paused — Cstore data is not syncing'
      : 'Warning: Cstore data is not syncing'
    const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#111">
  <h2 style="margin:0 0 12px;font-size:20px">Harvest agent — Cstore sync problem</h2>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:0 0 16px;color:#991b1b">
    ${escapeHtml(health.message)}
  </div>
  <p style="margin:0 0 16px;font-size:14px;color:#444">
    Last successful customer accounts sync: ${
      health.lastCustomerSyncAt
        ? escapeHtml(
            new Date(health.lastCustomerSyncAt).toLocaleString('en-US', {
              timeZone: 'America/St_Lucia',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })
          )
        : 'never'
    }
  </p>
  <p style="margin-top:28px;font-size:12px;color:#888"><a href="${escapeHtml(settingsUrl)}" style="color:#2563eb">View harvest agent log</a> · Automated daily reminder from Shift Close</p>
</body></html>`

    const errors: string[] = []
    for (const to of recipients) {
      try {
        await sendMail({ to, subject, html })
      } catch (e) {
        errors.push(`${to}: ${e instanceof Error ? e.message : 'error'}`)
      }
    }
    if (errors.length > 0) {
      return NextResponse.json({ error: 'One or more sends failed', details: errors }, { status: 500 })
    }
    return NextResponse.json({ ok: true, sent: recipients.length, level: health.level })
  } catch (e) {
    console.error('cron harvest-health', e)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
