import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'

export async function notifyManagersShiftReopened(shift: {
  id: string
  date: string
  shift: string
}): Promise<void> {
  const recipients = await prisma.appUser.findMany({
    where: { role: { in: ['admin', 'manager'] } },
    select: { email: true }
  })
  const emails = [...new Set(recipients.map((r) => r.email).filter(Boolean))]
  if (emails.length === 0) {
    console.warn('notifyManagersShiftReopened: no admin/manager emails in app_users')
    return
  }

  const subject = `Shift reopened for review: ${shift.date} ${shift.shift}`
  const text = [
    `A shift was reopened for audited changes.`,
    ``,
    `Date: ${shift.date}`,
    `Shift: ${shift.shift}`,
    `Record ID: ${shift.id}`,
    ``,
    `Open the app → Shifts to review.`
  ].join('\n')

  for (const to of emails) {
    try {
      await sendMail({ to, subject, text })
    } catch (e) {
      console.error('notifyManagersShiftReopened email failed', to, e)
    }
  }
}
