import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import {
  buildMissingDepositSlipEmailHtml,
  getMissingDepositSlipRecipients,
  isMissingDepositSlipEmailEnabled,
  parseSelectionsJson,
  selectionFingerprint,
  validateSelections,
  type DepositSlipSelection
} from '@/lib/missing-deposit-slip-alert'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    const { date } = await params
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as { force?: boolean }
    const force = Boolean(body?.force)

    const enabled = await isMissingDepositSlipEmailEnabled()
    if (!enabled) {
      const existing = await prisma.missingDepositSlipAlert.findUnique({ where: { date } })
      if (existing) {
        await prisma.missingDepositSlipAlert.update({
          where: { date },
          data: { lastEmailError: 'Missing deposit slip emails are disabled in Settings.' }
        })
      }
      return NextResponse.json(
        { error: 'Missing deposit slip email is disabled in Settings.', skipped: true },
        { status: 400 }
      )
    }

    const recipients = await getMissingDepositSlipRecipients()
    if (recipients.length === 0) {
      const existing = await prisma.missingDepositSlipAlert.findUnique({ where: { date } })
      if (existing) {
        await prisma.missingDepositSlipAlert.update({
          where: { date },
          data: { lastEmailError: 'Add at least one recipient under Settings → Missing deposit slip alerts.' }
        })
      }
      return NextResponse.json(
        { error: 'No recipients configured for missing deposit slip alerts.', skipped: true },
        { status: 400 }
      )
    }

    const alert = await prisma.missingDepositSlipAlert.findUnique({ where: { date } })
    if (!alert || !alert.open) {
      return NextResponse.json({ skipped: true, reason: 'no_open_alert' })
    }

    const selections = parseSelectionsJson(alert.selectionsJson) as DepositSlipSelection[]
    if (selections.length === 0) {
      return NextResponse.json({ error: 'Select at least one deposit line before sending.' }, { status: 400 })
    }

    const shifts = await prisma.shiftClose.findMany({
      where: { date },
      select: { id: true, deposits: true, shift: true, supervisor: true }
    })
    const validated = validateSelections(shifts, selections)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const fp = selectionFingerprint(selections, alert.note)
    if (!force && alert.lastNotifyFingerprint === fp) {
      return NextResponse.json({ skipped: true, reason: 'already_notified_for_state' })
    }

    const html = buildMissingDepositSlipEmailHtml({
      date,
      rows: validated.rows,
      note: alert.note
    })
    const subject = `Missing deposit slip scan — ${date}`

    const errors: string[] = []
    for (const to of recipients) {
      try {
        await sendMail({ to, subject, html })
      } catch (e) {
        errors.push(`${to}: ${e instanceof Error ? e.message : 'error'}`)
      }
    }

    if (errors.length > 0) {
      const msg = errors.join('; ')
      await prisma.missingDepositSlipAlert.update({
        where: { date },
        data: { lastEmailError: msg.slice(0, 4000) }
      })
      return NextResponse.json({ error: 'One or more sends failed', details: errors }, { status: 500 })
    }

    const now = new Date()
    await prisma.missingDepositSlipAlert.update({
      where: { date },
      data: {
        lastNotifyFingerprint: fp,
        lastNotifySentAt: now,
        firstNotifySentAt: alert.firstNotifySentAt ?? now,
        lastEmailError: null
      }
    })

    return NextResponse.json({ ok: true, sent: recipients.length })
  } catch (e) {
    console.error('missing-deposit-slip notify', e)
    return NextResponse.json({ error: 'Notify failed' }, { status: 500 })
  }
}
