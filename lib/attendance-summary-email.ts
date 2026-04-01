import { getPublicAppUrlFromEnv } from '@/lib/public-url'
import { parseRecipientEmails } from '@/lib/eod-email'
import type { AttendanceSummaryRow } from '@/lib/attendance-summary-data'

export const ATTENDANCE_SUMMARY_EMAIL_ENABLED_KEY = 'attendance_summary_email_enabled'
export const ATTENDANCE_SUMMARY_EMAIL_RECIPIENTS_KEY = 'attendance_summary_email_recipients'
export const ATTENDANCE_SUMMARY_EMAIL_LAST_SENT_KEY = 'attendance_summary_email_last_sent'

export { parseRecipientEmails }

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function absUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

export function buildAttendanceSummaryEmailHtml(params: {
  reportDateYmd: string
  periodStartYmd: string
  periodLabel: string
  timeZone: string
  rows: AttendanceSummaryRow[]
}): string {
  const { reportDateYmd, periodLabel, timeZone, rows } = params
  const baseUrl = getPublicAppUrlFromEnv()

  const openAttendance = baseUrl
    ? `<p><a href="${absUrl(baseUrl, '/attendance')}">Open Attendance</a></p>`
    : ''

  const dayRows = rows
    .map((r) => {
      const punches =
        r.punchesToday.length > 0
          ? `<ul style="margin:4px 0 0 16px;padding:0;font-size:13px;color:#444">${r.punchesToday
              .map(
                (p) =>
                  `<li>${esc(p.label)} — <strong>${esc(String(p.punchType))}</strong></li>`
              )
              .join('')}</ul>`
          : '<span style="color:#888;font-size:13px">No punches</span>'
      return `<tr>
<td style="padding:8px 10px;border-bottom:1px solid #eee;vertical-align:top">${esc(r.staffName)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${r.hoursToday.toFixed(2)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #eee">${punches}</td>
</tr>`
    })
    .join('')

  const periodRows = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(r.staffName)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${r.hoursPeriodToDate.toFixed(2)}</td></tr>`
    )
    .join('')

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;max-width:720px;margin:0 auto;padding:16px;color:#111">
  <h2 style="color:#111;margin-top:0">Attendance summary — ${esc(reportDateYmd)}</h2>
  <p style="color:#444;font-size:14px">Report day uses timezone <strong>${esc(timeZone)}</strong> (same “previous day” idea as other daily jobs). Hours use paired in/out punches in order, matching the pay period generator.</p>

  <h3 style="font-size:16px;margin:24px 0 8px">Hours &amp; punches — ${esc(reportDateYmd)}</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr>
        <th style="text-align:left;padding:8px 10px;border-bottom:2px solid #ddd">Staff</th>
        <th style="text-align:right;padding:8px 10px;border-bottom:2px solid #ddd;white-space:nowrap">Hours</th>
        <th style="text-align:left;padding:8px 10px;border-bottom:2px solid #ddd">Punches</th>
      </tr>
    </thead>
    <tbody>${dayRows}</tbody>
  </table>

  <h3 style="font-size:16px;margin:28px 0 8px">Pay period to date — ${esc(periodLabel)}</h3>
  <p style="color:#666;font-size:13px;margin:0 0 8px">Running total from the start of the current period through this report date. Period start is the day after the last <em>saved and emailed</em> pay period, or the first of the month if none.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr>
        <th style="text-align:left;padding:8px 10px;border-bottom:2px solid #ddd">Staff</th>
        <th style="text-align:right;padding:8px 10px;border-bottom:2px solid #ddd">Hours (period)</th>
      </tr>
    </thead>
    <tbody>${periodRows}</tbody>
  </table>

  ${openAttendance}
  <p style="color:#666;font-size:12px;margin-top:24px">Automated attendance summary from Shift Close.</p>
</body></html>`.trim()
}
