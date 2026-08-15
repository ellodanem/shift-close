import {
  formatDateDisplay,
  formatDateRange,
  splitPayPeriodNotesForExport,
  type PayPeriodExcelData
} from '@/lib/pay-period-excel'

/** Default recipients when emailing a saved pay period report from Attendance → Pay Period. */
export const PAY_PERIOD_REPORT_DEFAULT_RECIPIENTS = [
  'elrus_e@hotmail.com',
  'elcock@totalauto758.com'
] as const

export const PAY_PERIOD_REPORT_DEFAULT_BCC_RECIPIENTS = [
  'dane.elrus1@gmail.com',
  'totalarubis@gmail.com',
  'totalauto_os@outlook.com'
] as const

export function payPeriodReportDefaultTo(): string {
  return PAY_PERIOD_REPORT_DEFAULT_RECIPIENTS.join(', ')
}

export function payPeriodReportDefaultBcc(): string {
  return PAY_PERIOD_REPORT_DEFAULT_BCC_RECIPIENTS.join(', ')
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

/** One HTML line per notes field — email clients often ignore white-space: pre-wrap. */
export function formatPayPeriodNotesEmailHtml(notes: string): string {
  const lines = splitPayPeriodNotesForExport(notes)
  if (lines.length === 0) return ''
  return lines.map(escapePayPeriodHtml).join('<br>')
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
        ${(data.notes ?? '').trim() ? `<p>${formatPayPeriodNotesEmailHtml(data.notes ?? '')}</p>` : ''}
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <th style="text-align: left; padding: 8px 12px 8px 8px;">Staff</th>
            <th style="text-align: right; padding: 8px 12px;">Trans Ttl</th>
            <th style="text-align: center; padding: 8px 12px;">Vacation</th>
            <th style="text-align: center; padding: 8px 16px;">Sick Days</th>
            <th style="text-align: left; padding: 8px 8px 8px 16px;">Sick Leave</th>
            <th style="text-align: right; padding: 8px 8px 8px 12px;">Shortage</th>
          </tr>
          ${rows
            .map(
              (r) =>
                `<tr><td style="padding: 8px 12px 8px 8px;">${r.staffName}</td><td style="text-align: right; padding: 8px 12px;">${r.transTtl.toFixed(2)}</td><td style="text-align: center; padding: 8px 12px;">${r.vacation}</td><td style="text-align: center; padding: 8px 16px;">${r.sickLeaveDays ?? 0}</td><td style="text-align: left; padding: 8px 8px 8px 16px;">${r.sickLeaveRanges ?? ''}</td><td style="text-align: right; padding: 8px 8px 8px 12px;">${r.shortage > 0 ? `$${r.shortage.toFixed(2)}` : ''}</td></tr>`
            )
            .join('')}
          <tr><td style="padding: 8px 12px 8px 8px;"><strong>Total</strong></td><td style="text-align: right; padding: 8px 12px;"><strong>${totalTrans.toFixed(1)}</strong></td><td style="padding: 8px 12px;"></td><td style="text-align: center; padding: 8px 16px;"><strong>${rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0)}</strong></td><td style="padding: 8px 8px 8px 16px;"></td><td style="text-align: right; padding: 8px 8px 8px 12px;"><strong>${totalShortage > 0 ? `$${totalShortage.toFixed(2)}` : ''}</strong></td></tr>
        </table>
      `
}
