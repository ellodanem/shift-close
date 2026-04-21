import type { DayReport } from '@/lib/types'
import { formatCurrency } from '@/lib/format'

export const EOD_EMAIL_ENABLED_KEY = 'eod_email_enabled'
export const EOD_EMAIL_RECIPIENTS_KEY = 'eod_email_recipients'
export const EOD_EMAIL_LAST_SENT_KEY = 'eod_email_last_sent'

/** Default IANA timezone for “yesterday” when computing the report date (St. Lucia). */
export const DEFAULT_EOD_TIMEZONE = 'America/St_Lucia'

/** Report date = previous calendar day in the given timezone (for daily cron after close). */
export function getReportDateYmd(timeZone: string): string {
  const ms = 24 * 60 * 60 * 1000
  const yesterday = new Date(Date.now() - ms)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(yesterday)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseRecipientEmails(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const uniq = [...new Set(parts)]
  return uniq.filter((e) => EMAIL_RE.test(e))
}

function absUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildEndOfDayEmailHtml(
  report: DayReport | null,
  date: string,
  baseUrl: string
): string {
  if (!report) {
    return `
<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:16px">
  <h2 style="color:#111">End of day — ${date}</h2>
  <p>No shift close entries were recorded for this date.</p>
  <p style="color:#666;font-size:13px;margin-top:24px">Automated message from Shift Close — End of Day</p>
</body></html>`.trim()
  }

  const t = report.totals
  const depositLinks =
    report.depositScans.length > 0
      ? `<ul>${report.depositScans.map((u) => `<li><a href="${u}">Deposit scan</a></li>`).join('')}</ul>`
      : '<p><em>No deposit scans uploaded.</em></p>'
  const debitLinks =
    report.debitScans.length > 0
      ? `<ul>${report.debitScans.map((u) => `<li><a href="${u}">Debit scan</a></li>`).join('')}</ul>`
      : '<p><em>No debit scans uploaded.</em></p>'
  const securityScans = report.securityScans ?? []
  const waiverNote = (report.securityScanWaiverNote ?? '').trim()
  const securityLinks =
    securityScans.length > 0
      ? `<ul>${securityScans.map((u) => `<li><a href="${u}">Security scan</a></li>`).join('')}</ul>`
      : report.securityScanWaived
        ? `<p><em>No security scan file — marked without pickup (deposit still dropped off).</em>${
            waiverNote ? ` <span style="color:#444">(${escapeHtmlText(waiverNote)})</span>` : ''
          }</p>`
        : '<p><em>No security scans uploaded.</em></p>'

  const daysLink = baseUrl ? `<p><a href="${absUrl(baseUrl, '/days')}">Open End of Day in Shift Close</a></p>` : ''

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:16px">
  <h2 style="color:#111">End of day — ${report.date}</h2>
  <p><strong>Status:</strong> ${report.status} &nbsp;·&nbsp; <strong>Day type:</strong> ${report.dayType}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee">Over/short (disclosed)</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #eee">${t.overShortDisclosedTotal === null ? '—' : formatCurrency(t.overShortDisclosedTotal)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee">Total deposits</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #eee">${formatCurrency(t.totalDeposits)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee">Total credit (other)</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #eee">${formatCurrency(t.totalCredit)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee">System debit</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #eee">${formatCurrency(t.totalDebit)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee">Unleaded (L)</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #eee">${t.totalUnleaded.toLocaleString()}</td></tr>
    <tr><td style="padding:6px 0">Diesel (L)</td><td style="padding:6px 0;text-align:right">${t.totalDiesel.toLocaleString()}</td></tr>
  </table>
  <h3 style="font-size:15px;margin-top:20px">Deposit scans</h3>
  ${depositLinks}
  <h3 style="font-size:15px;margin-top:16px">Debit scans</h3>
  ${debitLinks}
  <h3 style="font-size:15px;margin-top:16px">Security scans</h3>
  ${securityLinks}
  ${daysLink}
  <p style="color:#666;font-size:12px;margin-top:24px">Automated end-of-day summary from Shift Close.</p>
</body></html>`.trim()
}
