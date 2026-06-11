import { formatDateDisplay, formatDateRange, type PayPeriodExcelData } from '@/lib/pay-period-excel'

/** Default recipients when emailing a saved pay period report from Attendance → Pay Period. */
export const PAY_PERIOD_REPORT_DEFAULT_RECIPIENTS = [
  'elrus_e@hotmail.com',
  'elcock@totalauto758.com'
] as const

export function payPeriodReportDefaultTo(): string {
  return PAY_PERIOD_REPORT_DEFAULT_RECIPIENTS.join(', ')
}

export function escapePayPeriodHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Same wording as the saved-period row (for email subject). */
export function formatSavedPayPeriodDateRange(start: string, end: string): string {
  return `${formatDateDisplay(start)} \u2013 ${formatDateDisplay(end)}`
}

export function payPeriodReportDefaultSubject(start: string, end: string): string {
  return `Staff hours commencing ${formatSavedPayPeriodDateRange(start, end)}`
}

export function buildPayPeriodEmailHtml(data: PayPeriodExcelData): string {
  const rows = data.rows
  const totalTrans = rows.reduce((s, r) => s + r.transTtl, 0)
  const totalShortage = rows.reduce((s, r) => s + r.shortage, 0)
  return `
        <h2>Summary Report</h2>
        <p><strong>Report Date:</strong> ${formatDateDisplay(data.reportDate)}</p>
        <p><strong>Date Range:</strong> ${formatDateRange(data.startDate, data.endDate)}</p>
        <p><strong>${data.entityName}</strong></p>
        ${(data.notes ?? '').trim() ? `<p style="white-space: pre-wrap;">${escapePayPeriodHtml(data.notes ?? '')}</p>` : ''}
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
          <tr><th>Staff</th><th>Trans Ttl</th><th>Vacation</th><th>Sick Days</th><th>Sick Leave</th><th>Shortage</th></tr>
          ${rows
            .map(
              (r) =>
                `<tr><td>${r.staffName}</td><td>${r.transTtl.toFixed(2)}</td><td>${r.vacation}</td><td>${r.sickLeaveDays ?? 0}</td><td>${r.sickLeaveRanges ?? ''}</td><td>${r.shortage > 0 ? `$${r.shortage.toFixed(2)}` : ''}</td></tr>`
            )
            .join('')}
          <tr><td><strong>Total</strong></td><td><strong>${totalTrans.toFixed(1)}</strong></td><td></td><td><strong>${rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0)}</strong></td><td></td><td><strong>${totalShortage > 0 ? `$${totalShortage.toFixed(2)}` : ''}</strong></td></tr>
        </table>
      `
}
