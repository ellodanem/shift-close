/**
 * Cron endpoint: call daily to send reminder notifications.
 * Vercel Cron: add to vercel.json: "crons": [{ "path": "/api/reminders/check", "schedule": "0 8 * * *" }]
 * Sends emails for reminders due for notification today (based on notifyDaysBefore).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    const reminders = await prisma.reminder.findMany({
      where: { date: { gte: todayStr } },
      orderBy: { date: 'asc' }
    })

    const payDays = await prisma.payDay.findMany({
      where: { date: { gte: todayStr } },
      orderBy: { date: 'asc' }
    })

    const recipients = await prisma.emailRecipient.findMany({
      orderBy: { sortOrder: 'asc' }
    })

    const sent: string[] = []
    const errors: string[] = []

    // Pay day reminders: 3 days before and 1 day before (to manager/admin)
    const payDayNotifyDays = [3, 1]
    for (const pd of payDays) {
      const payDate = new Date(pd.date + 'T12:00:00')
      const diffMs = payDate.getTime() - today.getTime()
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      if (!payDayNotifyDays.includes(daysUntil) || recipients.length === 0) continue

      const subject = `Pay Day Reminder: ${pd.date}${daysUntil === 1 ? ' (Tomorrow)' : ` (in ${daysUntil} days)`}`
      const html = `
        <h2>Pay Day Reminder</h2>
        <p>Accounting will process payments on <strong>${pd.date}</strong>.</p>
        ${pd.notes ? `<p>${pd.notes}</p>` : ''}
        <p><em>This is an automated reminder from Shift Close.</em></p>
      `
      for (const rec of recipients) {
        try {
          const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.NEXTAUTH_URL || request.nextUrl.origin || 'http://localhost:3000'
          const res = await fetch(`${baseUrl}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: rec.email,
              subject,
              html
            })
          })
          if (res.ok) {
            sent.push(`pay-day:${pd.id} -> ${rec.email}`)
          } else {
            const err = await res.json().catch(() => ({}))
            errors.push(`Pay Day ${pd.date}: ${err.error || res.statusText}`)
          }
        } catch (err) {
          errors.push(`Pay Day ${pd.date}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }
      // WhatsApp placeholder for pay days
      console.log(`[Pay Days] WhatsApp notification skipped for ${pd.date} (Twilio not configured)`)
    }

    for (const reminder of reminders) {
      const daysBefore = (reminder.notifyDaysBefore || '7,3,1,0')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n))

      const reminderDate = new Date(reminder.date + 'T12:00:00')
      const diffMs = reminderDate.getTime() - today.getTime()
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      if (!daysBefore.includes(daysUntil)) continue
      if (!reminder.notifyEmail || recipients.length === 0) continue

      const subject = `Reminder: ${reminder.title}${daysUntil === 0 ? ' (Today)' : daysUntil === 1 ? ' (Tomorrow)' : ` (in ${daysUntil} days)`}`
      const html = `
        <h2>Reminder</h2>
        <p><strong>${reminder.title}</strong></p>
        <p>Date: ${reminder.date}</p>
        ${reminder.notes ? `<p>${reminder.notes}</p>` : ''}
        <p><em>This is an automated reminder from Shift Close.</em></p>
      `

      for (const rec of recipients) {
        try {
          const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.NEXTAUTH_URL || request.nextUrl.origin || 'http://localhost:3000'
          const res = await fetch(`${baseUrl}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: rec.email,
              subject,
              html
            })
          })
          if (res.ok) {
            sent.push(`${reminder.id} -> ${rec.email}`)
          } else {
            const err = await res.json().catch(() => ({}))
            errors.push(`${reminder.title}: ${err.error || res.statusText}`)
          }
        } catch (err) {
          errors.push(`${reminder.title}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      // WhatsApp: not implemented (requires Twilio). Log for now.
      if (reminder.notifyWhatsApp) {
        console.log(`[Reminders] WhatsApp notification skipped for "${reminder.title}" (Twilio not configured)`)
      }
    }

    return NextResponse.json({
      success: true,
      sent: sent.length,
      details: sent,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Reminder check error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check reminders' },
      { status: 500 }
    )
  }
}
