import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseRecipientEmails } from '@/lib/eod-email'
import {
  HARVEST_EMAIL_ENABLED_KEY,
  HARVEST_EMAIL_RECIPIENTS_KEY,
  buildSampleHarvestTaskEmail,
  readHarvestEmailSettings,
  sendHarvestTaskEmailTo
} from '@/lib/harvest-agent-email'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const settings = await readHarvestEmailSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error('harvest-agent-email GET', error)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

/**
 * POST — save { enabled?, recipients? } or send test { sendTest: true, to?, recipients? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    if (body.sendTest === true) {
      const draftRecipients =
        typeof body.recipients === 'string' ? body.recipients : (await readHarvestEmailSettings()).recipients
      const overrideTo = typeof body.to === 'string' ? body.to.trim() : ''
      const emails = overrideTo ? [overrideTo] : parseRecipientEmails(draftRecipients)
      if (emails.length === 0) {
        return NextResponse.json({ error: 'Add at least one valid email address' }, { status: 400 })
      }
      const sample = buildSampleHarvestTaskEmail()
      for (const to of emails) {
        await sendHarvestTaskEmailTo(sample, to)
      }
      return NextResponse.json({ ok: true, sent: emails.length, sample: true })
    }

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined
    const recipients = typeof body.recipients === 'string' ? body.recipients : undefined

    if (enabled === undefined && recipients === undefined) {
      return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
    }

    if (enabled !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: HARVEST_EMAIL_ENABLED_KEY },
        update: { value: enabled ? 'true' : 'false' },
        create: { key: HARVEST_EMAIL_ENABLED_KEY, value: enabled ? 'true' : 'false' }
      })
    }

    if (recipients !== undefined) {
      const normalized = parseRecipientEmails(recipients).join(', ')
      await prisma.appSettings.upsert({
        where: { key: HARVEST_EMAIL_RECIPIENTS_KEY },
        update: { value: normalized },
        create: { key: HARVEST_EMAIL_RECIPIENTS_KEY, value: normalized }
      })
    }

    const settings = await readHarvestEmailSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error('harvest-agent-email POST', error)
    const message = error instanceof Error ? error.message : 'Failed to save settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
