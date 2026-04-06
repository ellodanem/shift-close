import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { sendWhatsApp, isWhatsAppConfigured } from '@/lib/whatsapp'
import {
  buildPresenceForDate,
  calendarYmdInTz,
  getPresentAbsenceSettings,
  mergeNotifyLog,
  parseNotifyLog,
  parseRecipientEmails,
  PRESENT_ABSENCE_NOTIFY_LOG_KEY,
  readStationTimeZone
} from '@/lib/present-absence'

function pruneNotifyLog(log: Record<string, string[]>, keepMostRecent = 30): Record<string, string[]> {
  const keys = Object.keys(log).sort()
  if (keys.length <= keepMostRecent) return log
  const keep = keys.slice(-keepMostRecent)
  const next: Record<string, string[]> = {}
  for (const k of keep) next[k] = log[k]!
  return next
}

/**
 * Notify managers about staff who are past grace with no punch (status "late").
 * Idempotent per staff per calendar day via PRESENT_ABSENCE_NOTIFY_LOG_KEY.
 */
export async function runPresentAbsenceNotifications(): Promise<{
  skipped: string
  emailed: number
  whatsapped: number
  staffNotified: string[]
}> {
  const settings = await getPresentAbsenceSettings()
  if (!settings.enabled) {
    return { skipped: 'present_absence_disabled', emailed: 0, whatsapped: 0, staffNotified: [] }
  }
  if (!settings.notifyEmail && !settings.notifyWhatsApp) {
    return { skipped: 'no_notify_channels', emailed: 0, whatsapped: 0, staffNotified: [] }
  }

  const tz = await readStationTimeZone()
  const now = new Date()
  const todayYmd = calendarYmdInTz(now, tz)

  const built = await buildPresenceForDate({
    dateYmd: todayYmd,
    tz,
    now,
    graceMinutes: settings.graceMinutes
  })

  const lateIds = Object.entries(built.presenceByStaffId)
    .filter(([, p]) => p.status === 'late' && p.isExpected)
    .map(([id]) => id)

  const logRow = await prisma.appSettings.findUnique({ where: { key: PRESENT_ABSENCE_NOTIFY_LOG_KEY } })
  let log = parseNotifyLog(logRow?.value)
  log = pruneNotifyLog(log)
  const already = new Set(log[todayYmd] ?? [])
  const need = lateIds.filter((id) => !already.has(id))

  if (need.length === 0) {
    return { skipped: 'nothing_to_notify', emailed: 0, whatsapped: 0, staffNotified: [] }
  }

  const lines = need.map((id) => {
    const s = built.scheduled.find((x) => x.staffId === id)
    const name = s?.staffFirstName ?? s?.staffName ?? id
    return `• ${name} — ${s?.shiftName ?? 'Shift'}`
  })
  const bodyText = `Late / no punch yet (${todayYmd} — ${tz})\n\n${lines.join('\n')}\n\n— Shift Close`
  const bodyHtml = `<p><strong>Late / no punch yet</strong> (${todayYmd}, ${tz})</p><ul>${need
    .map((id) => {
      const s = built.scheduled.find((x) => x.staffId === id)
      const name = s?.staffFirstName ?? s?.staffName ?? id
      return `<li>${name} — ${s?.shiftName ?? 'Shift'}</li>`
    })
    .join('')}</ul><p style="color:#666;font-size:13px">Automated message from Shift Close</p>`

  let emailed = 0
  let whatsapped = 0
  let delivered = false

  if (settings.notifyEmail) {
    const emails = parseRecipientEmails(settings.notifyEmailRecipients)
    if (emails.length > 0) {
      await sendMail({
        to: emails[0],
        cc: emails.length > 1 ? emails.slice(1).join(', ') : undefined,
        subject: `Attendance: late / no punch — ${todayYmd}`,
        text: bodyText,
        html: bodyHtml
      })
      emailed = emails.length
      delivered = true
    }
  }

  if (settings.notifyWhatsApp && isWhatsAppConfigured()) {
    const raw = settings.notifyWhatsAppNumbers
    const numbers = raw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (numbers.length > 0) {
      for (const to of numbers) {
        try {
          await sendWhatsApp(to, bodyText)
          whatsapped += 1
          delivered = true
        } catch (e) {
          console.error('[present-absence-notify] WhatsApp', to, e)
        }
      }
    }
  } else if (settings.notifyWhatsApp && !isWhatsAppConfigured()) {
    console.log('[present-absence-notify] WhatsApp skipped (Twilio not configured)')
  }

  if (!delivered) {
    return {
      skipped: 'no_recipients_or_delivery',
      emailed,
      whatsapped,
      staffNotified: []
    }
  }

  const nextLog = mergeNotifyLog(log, todayYmd, need)
  await prisma.appSettings.upsert({
    where: { key: PRESENT_ABSENCE_NOTIFY_LOG_KEY },
    update: { value: JSON.stringify(nextLog) },
    create: { key: PRESENT_ABSENCE_NOTIFY_LOG_KEY, value: JSON.stringify(nextLog) }
  })

  return { skipped: '', emailed, whatsapped, staffNotified: need }
}
