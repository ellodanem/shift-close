import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseRecipientEmails } from '@/lib/eod-email'
import {
  MISSING_DEPOSIT_SLIP_DIGEST_ENABLED_KEY,
  MISSING_DEPOSIT_SLIP_EMAIL_ENABLED_KEY,
  MISSING_DEPOSIT_SLIP_EMAIL_RECIPIENTS_KEY
} from '@/lib/missing-deposit-slip-alert'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [en, rec, dig] = await Promise.all([
      prisma.appSettings.findUnique({ where: { key: MISSING_DEPOSIT_SLIP_EMAIL_ENABLED_KEY } }),
      prisma.appSettings.findUnique({ where: { key: MISSING_DEPOSIT_SLIP_EMAIL_RECIPIENTS_KEY } }),
      prisma.appSettings.findUnique({ where: { key: MISSING_DEPOSIT_SLIP_DIGEST_ENABLED_KEY } })
    ])
    return NextResponse.json({
      enabled: en?.value === 'true',
      recipients: rec?.value ?? '',
      digestEnabled: dig?.value !== 'false'
    })
  } catch (e) {
    console.error('missing-deposit-slip-alerts GET', e)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      enabled?: boolean
      recipients?: string
      digestEnabled?: boolean
    }

    if (body.enabled !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: MISSING_DEPOSIT_SLIP_EMAIL_ENABLED_KEY },
        update: { value: body.enabled ? 'true' : 'false' },
        create: { key: MISSING_DEPOSIT_SLIP_EMAIL_ENABLED_KEY, value: body.enabled ? 'true' : 'false' }
      })
    }
    if (body.recipients !== undefined) {
      const emails = parseRecipientEmails(String(body.recipients))
      await prisma.appSettings.upsert({
        where: { key: MISSING_DEPOSIT_SLIP_EMAIL_RECIPIENTS_KEY },
        update: { value: emails.join(', ') },
        create: { key: MISSING_DEPOSIT_SLIP_EMAIL_RECIPIENTS_KEY, value: emails.join(', ') }
      })
    }
    if (body.digestEnabled !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: MISSING_DEPOSIT_SLIP_DIGEST_ENABLED_KEY },
        update: { value: body.digestEnabled ? 'true' : 'false' },
        create: { key: MISSING_DEPOSIT_SLIP_DIGEST_ENABLED_KEY, value: body.digestEnabled ? 'true' : 'false' }
      })
    }

    return await GET()
  } catch (e) {
    console.error('missing-deposit-slip-alerts POST', e)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
