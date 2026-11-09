/**
 * Over/short report: for a range of days, how far the counts are from the system, and how the bank
 * deposits compare with the cash counted. Pure functions, no database access.
 *
 * Cash + Checks is the headline: Count minus System for the day's shifts added together (negative means
 * money is missing). Credit/Debit is the same comparison for card sales. Deposited vs counted is
 * Deposited minus the Cash + Checks counted, so it can swing between days when cash is counted on one
 * day and banked on another.
 */
import {
  DOLLAR_TOLERANCE,
  OVER_SHORT_LOOK_THRESHOLD,
  formatMoney,
  round2,
  type DayReconcile
} from '@/lib/day-reconcile'
import { ymdToUtcNoonDate } from '@/lib/datetime-policy'

/** What the report needs from an End of Day record. */
export type OverShortDayInput = {
  date: string
  shifts: Array<{ shift: string }>
  reconcile: DayReconcile
}

export type OverShortRow = {
  date: string
  /** "Nov 6" */
  dayLabel: string
  /** "Fri" */
  weekday: string
  /** "1-9 + 6-1" */
  shifts: string
  /** Count minus System for Cash + Checks. */
  cashChecks: number
  /** Count minus System for Credit/Debit. */
  creditDebit: number
  /** Deposited minus the Cash + Checks counted. */
  depositDiff: number
  /** True when any of the three is worth a look (the red dot). */
  flagged: boolean
}

export type OverShortReport = {
  from: string
  to: string
  rows: OverShortRow[]
  totals: {
    cashChecks: number
    creditDebit: number
    depositDiff: number
    cashSystem: number
    cashCount: number
  }
  notes: string[]
}

export function shortMonthDay(ymd: string): string {
  return ymdToUtcNoonDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function shortWeekday(ymd: string): string {
  return ymdToUtcNoonDate(ymd).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

function isFlagged(cashChecks: number, creditDebit: number, depositDiff: number): boolean {
  return (
    Math.abs(cashChecks) >= DOLLAR_TOLERANCE ||
    Math.abs(creditDebit) >= DOLLAR_TOLERANCE ||
    Math.abs(depositDiff) > OVER_SHORT_LOOK_THRESHOLD
  )
}

export function buildOverShortReport(days: OverShortDayInput[], from: string, to: string): OverShortReport {
  const inRange = days
    .filter((d) => d.date >= from && d.date <= to && d.shifts.length > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const rows: OverShortRow[] = inRange.map((d) => {
    const cashChecks = d.reconcile.overShort.overShort
    const creditDebit = d.reconcile.collected.lines.find((l) => l.key === 'credits')?.overShort ?? 0
    const depositDiff = d.reconcile.collected.deposit.diff
    return {
      date: d.date,
      dayLabel: shortMonthDay(d.date),
      weekday: shortWeekday(d.date),
      shifts: d.shifts.map((s) => s.shift).join(' + '),
      cashChecks,
      creditDebit,
      depositDiff,
      flagged: isFlagged(cashChecks, creditDebit, depositDiff)
    }
  })

  const totals = {
    cashChecks: round2(rows.reduce((t, r) => t + r.cashChecks, 0)),
    creditDebit: round2(rows.reduce((t, r) => t + r.creditDebit, 0)),
    depositDiff: round2(rows.reduce((t, r) => t + r.depositDiff, 0)),
    cashSystem: round2(inRange.reduce((t, d) => t + d.reconcile.overShort.system, 0)),
    cashCount: round2(inRange.reduce((t, d) => t + d.reconcile.overShort.count, 0))
  }

  const notes: string[] = []
  if (rows.length === 0) {
    notes.push('No closed shifts in this range.')
  } else {
    const n = rows.length
    const dayWord = n === 1 ? 'day' : 'days'
    if (Math.abs(totals.cashChecks) >= DOLLAR_TOLERANCE) {
      notes.push(
        `Cash + Checks ${totals.cashChecks < 0 ? 'short' : 'over'} ${formatMoney(Math.abs(totals.cashChecks))} over ${n} ${dayWord}: ${formatMoney(totals.cashCount)} counted against ${formatMoney(totals.cashSystem)} on the system.`
      )
    } else {
      notes.push(`Cash + Checks balanced over ${n} ${dayWord}.`)
    }
    const worst = rows.reduce<OverShortRow | null>(
      (w, r) => (r.cashChecks < 0 && (w === null || r.cashChecks < w.cashChecks) ? r : w),
      null
    )
    if (worst) notes.push(`Largest daily shortage: ${worst.dayLabel} ${formatMoney(worst.cashChecks)}.`)
    if (Math.abs(totals.depositDiff) > OVER_SHORT_LOOK_THRESHOLD) {
      notes.push(
        `Deposited ${formatMoney(Math.abs(totals.depositDiff))} ${totals.depositDiff < 0 ? 'less' : 'more'} than the cash and checks counted. Cash counted on one day and banked on another shows up as opposite swings between days.`
      )
    }
  }

  return { from, to, rows, totals, notes }
}

/** A signed dollar figure for a table cell. Zero shows as a dash. */
export function signedMoney(n: number): string {
  return Math.abs(n) < DOLLAR_TOLERANCE ? '-' : formatMoney(n, true)
}

export function rangeLabel(from: string, to: string): string {
  const year = ymdToUtcNoonDate(to).getUTCFullYear()
  return from === to ? `${shortMonthDay(to)}, ${year}` : `${shortMonthDay(from)} to ${shortMonthDay(to)}, ${year}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function amountColor(n: number): string {
  if (Math.abs(n) < DOLLAR_TOLERANCE) return '#444'
  return n < 0 ? '#b91c1c' : '#047857'
}

export type OverShortEmail = { subject: string; html: string; text: string }

export function buildOverShortEmail(report: OverShortReport, baseUrl = ''): OverShortEmail {
  const label = rangeLabel(report.from, report.to)
  const subject = `Over/short report: ${label}`

  const cell = 'padding:6px 8px;border-bottom:1px solid #eee;'
  const num = (n: number, bold = false) =>
    `<td style="${cell}text-align:right;color:${amountColor(n)};${bold ? 'font-weight:600;' : ''}">${escapeHtml(signedMoney(n))}</td>`

  const bodyRows = report.rows
    .map(
      (r) => `
    <tr>
      <td style="${cell}"><span style="color:${r.flagged ? '#b91c1c' : '#047857'}">&#9679;</span> ${escapeHtml(r.dayLabel)} <span style="color:#777">${escapeHtml(r.weekday)}</span></td>
      <td style="${cell}text-align:right;color:#444">${escapeHtml(r.shifts)}</td>
      ${num(r.cashChecks)}
      ${num(r.creditDebit)}
      ${num(r.depositDiff)}
    </tr>`
    )
    .join('')

  const link = baseUrl
    ? `<p><a href="${escapeHtml(baseUrl.replace(/\/$/, ''))}/reports/over-short?from=${report.from}&amp;to=${report.to}">Open this report in Shift Close</a></p>`
    : ''

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:16px;color:#111">
  <h2 style="margin:0 0 4px">Over/short report</h2>
  <p style="margin:0 0 16px;color:#555">${escapeHtml(label)}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="color:#666;font-size:12px;text-align:right">
        <th style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;font-weight:400">Day</th>
        <th style="padding:6px 8px;border-bottom:1px solid #ddd;font-weight:400">Shifts</th>
        <th style="padding:6px 8px;border-bottom:1px solid #ddd;font-weight:400">Cash + Checks</th>
        <th style="padding:6px 8px;border-bottom:1px solid #ddd;font-weight:400">Credit/Debit</th>
        <th style="padding:6px 8px;border-bottom:1px solid #ddd;font-weight:400">Deposited vs counted</th>
      </tr>
    </thead>
    <tbody>${bodyRows}
    <tr>
      <td style="${cell}font-weight:600">Range total</td>
      <td style="${cell}"></td>
      ${num(report.totals.cashChecks, true)}
      ${num(report.totals.creditDebit, true)}
      ${num(report.totals.depositDiff, true)}
    </tr>
    </tbody>
  </table>
  <h3 style="font-size:15px;margin:20px 0 6px">Notes</h3>
  ${report.notes.map((n) => `<p style="margin:4px 0">${escapeHtml(n)}</p>`).join('')}
  ${link}
  <p style="color:#666;font-size:12px;margin-top:24px">Cash + Checks and Credit/Debit are the count minus the system, so a minus means money is missing. Deposited vs counted is the bank deposit minus the cash and checks counted.</p>
</body></html>`.trim()

  const pad = (s: string, n: number) => s.padEnd(n)
  const lines = [
    `Over/short report: ${label}`,
    '',
    `${pad('Day', 14)}${pad('Shifts', 12)}${pad('Cash + Checks', 16)}${pad('Credit/Debit', 15)}Deposited vs counted`,
    ...report.rows.map(
      (r) =>
        `${pad(`${r.dayLabel} ${r.weekday}`, 14)}${pad(r.shifts, 12)}${pad(signedMoney(r.cashChecks), 16)}${pad(signedMoney(r.creditDebit), 15)}${signedMoney(r.depositDiff)}`
    ),
    `${pad('Range total', 26)}${pad(signedMoney(report.totals.cashChecks), 16)}${pad(signedMoney(report.totals.creditDebit), 15)}${signedMoney(report.totals.depositDiff)}`,
    '',
    'Notes',
    ...report.notes
  ]

  return { subject, html, text: lines.join('\n') }
}
