/**
 * Daily digest: email recipients about calendar days that still have an open missing-deposit-slip alert.
 * Secure with CRON_SECRET (Bearer), same as other crons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { DEFAULT_EOD_TIMEZONE } from '@/lib/eod-email'
import {
  buildMissingDepositSlipDigestHtml,
  dateToYmdInZone,
  getMissingDepositSlipRecipients,
  getTodayYmdInZone,
  isMissingDepositSlipDigestEnabled,
  isMissingDepositSlipEmailEnabled,
  parseSelectionsJson,
  validateSelections,
  type DepositSlipSelection,
  type DepositSlipSelectionRow
} from '@/lib/missing-deposit-slip-alert'

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

    if (!(await isMissingDepositSlipEmailEnabled())) {
      return NextResponse.json({ skipped: true, reason: 'email_disabled' })
    }
    if (!(await isMissingDepositSlipDigestEnabled())) {
      return NextResponse.json({ skipped: true, reason: 'digest_disabled' })
    }

    const recipients = await getMissingDepositSlipRecipients()
    if (recipients.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'no_recipients' })
    }

    const rowTz = await prisma.appSettings.findUnique({ where: { key: TZ_KEY } })
    const timeZone = rowTz?.value?.trim() || process.env.EOD_EMAIL_TIMEZONE?.trim() || DEFAULT_EOD_TIMEZONE
    const todayYmd = getTodayYmdInZone(timeZone)

    const openAlerts = await prisma.missingDepositSlipAlert.findMany({
      where: { open: true }
    })

    const digestItems: { date: string; rows: DepositSlipSelectionRow[]; note: string }[] = []

    for (const a of openAlerts) {
      if (a.lastDigestSentYmd === todayYmd) continue

      const selections = parseSelectionsJson(a.selectionsJson) as DepositSlipSelection[]
      if (selections.length === 0) continue

      if (a.firstNotifySentAt) {
        const firstDay = dateToYmdInZone(a.firstNotifySentAt, timeZone)
        if (firstDay === todayYmd) continue
      }

      const shifts = await prisma.shiftClose.findMany({
        where: { date: a.date },
        select: { id: true, deposits: true, shift: true, supervisor: true }
      })
      const validated = validateSelections(shifts, selections)
      if (!validated.ok) continue

      digestItems.push({ date: a.date, rows: validated.rows, note: a.note })
    }

    if (digestItems.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'nothing_to_send', todayYmd })
    }

    digestItems.sort((x, y) => x.date.localeCompare(y.date))
    const html = buildMissingDepositSlipDigestHtml(digestItems)
    const subject = `Reminder: open missing deposit slip flag(s) — ${todayYmd}`

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

    const dates = [...new Set(digestItems.map((i) => i.date))]
    await prisma.missingDepositSlipAlert.updateMany({
      where: { date: { in: dates } },
      data: { lastDigestSentYmd: todayYmd }
    })

    return NextResponse.json({ ok: true, sent: recipients.length, days: dates.length, todayYmd })
  } catch (e) {
    console.error('cron missing-deposit-slip-digest', e)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
