/**
 * Rubis rent-due alerts: from the 2nd of each month, if Fuel Payments has no
 * Rent invoice (pending or paid) with a due date in the current calendar month,
 * show an in-app banner and send daily reminder emails.
 */
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { businessTodayYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { getPublicAppUrlFromEnv } from '@/lib/public-url'

export const RENT_DUE_EMAIL_LAST_YMD_KEY = 'rent_due_email_last_ymd'

/** Fixed recipients for rent-due alerts (product requirement). */
export const RENT_DUE_RECIPIENTS = ['dane.elrus1@gmail.com', 'totalarubis@gmail.com'] as const

export type RentDueStatus = {
  /** True when day-of-month >= 2 and no matching Rent invoice exists for this month. */
  due: boolean
  /** Business calendar today (America/St_Lucia). */
  todayYmd: string
  year: number
  month: number
  monthLabel: string
  dayOfMonth: number
  /** Earliest day alerts apply (always 2). */
  alertFromDay: number
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const

export function parseYmdParts(ymd: string): { year: number; month: number; day: number } {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10))
  return { year: y, month: m, day: d }
}

const RENT_DUE_STATUS_CACHE_MS = 60_000
let rentDueStatusCache: { at: number; status: RentDueStatus } | null = null

/** Inclusive UTC noon bounds for dueDate / invoiceDate stored as date-only. */
export function monthDueDateBounds(year: number, month: number): { gte: Date; lte: Date } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return {
    gte: ymdToUtcNoonDate(`${year}-${mm}-01`),
    lte: ymdToUtcNoonDate(`${year}-${mm}-${String(lastDay).padStart(2, '0')}`)
  }
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/**
 * True if any pending/simulated/paid Invoice or PaidInvoice of type Rent has a
 * due date or invoice date in the given calendar month (UTC date parts).
 */
export async function hasRentInvoiceForMonth(year: number, month: number): Promise<boolean> {
  const { gte, lte } = monthDueDateBounds(year, month)
  const inMonth = {
    OR: [{ dueDate: { gte, lte } }, { invoiceDate: { gte, lte } }]
  }

  const [pendingCount, paidCount] = await Promise.all([
    prisma.invoice.count({
      where: {
        type: 'Rent',
        status: { in: ['pending', 'simulated', 'paid'] },
        ...inMonth
      }
    }),
    prisma.paidInvoice.count({
      where: {
        type: 'Rent',
        ...inMonth
      }
    })
  ])

  return pendingCount > 0 || paidCount > 0
}

export async function getRentDueStatus(now = new Date()): Promise<RentDueStatus> {
  if (rentDueStatusCache && Date.now() - rentDueStatusCache.at < RENT_DUE_STATUS_CACHE_MS) {
    return rentDueStatusCache.status
  }

  const todayYmd = businessTodayYmd(now)
  const { year, month, day } = parseYmdParts(todayYmd)
  const alertFromDay = 2
  const label = monthLabel(year, month)

  if (day < alertFromDay) {
    const status: RentDueStatus = {
      due: false,
      todayYmd,
      year,
      month,
      monthLabel: label,
      dayOfMonth: day,
      alertFromDay
    }
    rentDueStatusCache = { at: Date.now(), status }
    return status
  }

  const hasRent = await hasRentInvoiceForMonth(year, month)
  const status: RentDueStatus = {
    due: !hasRent,
    todayYmd,
    year,
    month,
    monthLabel: label,
    dayOfMonth: day,
    alertFromDay
  }
  rentDueStatusCache = { at: Date.now(), status }
  return status
}

export function buildRentDueEmailHtml(status: RentDueStatus, kind: 'first' | 'daily'): string {
  const appUrl = getPublicAppUrlFromEnv()
  const fuelPaymentsUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/fuel-payments` : '/fuel-payments'
  const intro =
    kind === 'first'
      ? `Rubis rent for <strong>${status.monthLabel}</strong> is due.`
      : `Reminder: Rubis rent for <strong>${status.monthLabel}</strong> is still due.`

  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>${intro}</p>
  <p>No Fuel Payments invoice with type <strong>Rent</strong> was found for this month
  (pending or paid), based on invoice due date or invoice date.</p>
  <p>Please enter the rent invoice in Fuel Payments so this alert clears.</p>
  <p><a href="${fuelPaymentsUrl}">Open Fuel Payments</a></p>
  <p style="color:#666;font-size:12px;margin-top:24px">Automated reminder from Shift Close.</p>
</body>
</html>`
}

export function rentDueEmailSubject(status: RentDueStatus, kind: 'first' | 'daily'): string {
  if (kind === 'first') {
    return `Rubis Rent is due — ${status.monthLabel}`
  }
  return `Reminder: Rubis Rent still due — ${status.monthLabel}`
}

export async function getRentDueLastEmailYmd(): Promise<string | null> {
  const row = await prisma.appSettings.findUnique({ where: { key: RENT_DUE_EMAIL_LAST_YMD_KEY } })
  const v = row?.value?.trim()
  return v || null
}

export async function setRentDueLastEmailYmd(ymd: string): Promise<void> {
  await prisma.appSettings.upsert({
    where: { key: RENT_DUE_EMAIL_LAST_YMD_KEY },
    create: { key: RENT_DUE_EMAIL_LAST_YMD_KEY, value: ymd },
    update: { value: ymd }
  })
}

/**
 * Send rent-due email if alerts apply and we have not already emailed today.
 * On the 2nd: first alert. On later days: daily reminder until a Rent invoice exists.
 */
export async function runRentDueEmailJob(now = new Date()): Promise<{
  skipped?: string
  sent?: number
  kind?: 'first' | 'daily'
  todayYmd: string
  errors?: string[]
}> {
  const status = await getRentDueStatus(now)
  if (!status.due) {
    return { skipped: status.dayOfMonth < status.alertFromDay ? 'before_alert_day' : 'rent_recorded', todayYmd: status.todayYmd }
  }

  const lastYmd = await getRentDueLastEmailYmd()
  if (lastYmd === status.todayYmd) {
    return { skipped: 'already_sent_today', todayYmd: status.todayYmd }
  }

  // First alert wording on the 2nd; daily reminder wording on later days.
  const emailKind: 'first' | 'daily' = status.dayOfMonth === status.alertFromDay ? 'first' : 'daily'

  const subject = rentDueEmailSubject(status, emailKind)
  const html = buildRentDueEmailHtml(status, emailKind)
  const errors: string[] = []

  for (const to of RENT_DUE_RECIPIENTS) {
    try {
      await sendMail({ to, subject, html })
    } catch (e) {
      errors.push(`${to}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  if (errors.length > 0) {
    return {
      todayYmd: status.todayYmd,
      kind: emailKind,
      errors,
      sent: RENT_DUE_RECIPIENTS.length - errors.length
    }
  }

  await setRentDueLastEmailYmd(status.todayYmd)
  return { sent: RENT_DUE_RECIPIENTS.length, kind: emailKind, todayYmd: status.todayYmd }
}
