import { payCycleLabel } from '@/lib/pay-cycle'
import { escapePayPeriodHtml } from '@/lib/pay-period-email'
import { formatMoney } from '@/lib/pay-run'

export type NisPrintLine = {
  staffName: string
  staffNo: string | null
  nisEmployee: number
  nisEmployer: number
  grossPay: number
}

export type PayrollPreviewLine = {
  staffName: string
  payType: string
  hours: number
  grossPay: number
  netPay: number
}

function usd(n: number): string {
  return n.toFixed(2)
}

function mdy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${m}/${d}/${y}`
}

function monthLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long' }).toUpperCase()
}

export function printNisReport(input: {
  startDate: string
  endDate: string
  cycle: string
  lines: NisPrintLine[]
  voided?: boolean
}) {
  const printWin = window.open('', '_blank')
  if (!printWin) return
  const rows = input.lines.filter((line) => line.grossPay !== 0 || line.nisEmployee !== 0 || line.nisEmployer !== 0)
  const body = rows
    .map((line) => {
      const name = line.staffNo ? `${line.staffNo} - ${line.staffName}` : line.staffName
      const govt = line.nisEmployee + line.nisEmployer
      return `<tr>
        <td>${escapePayPeriodHtml(name)}</td>
        <td class="num">${usd(line.nisEmployee)}</td>
        <td class="num">${usd(line.nisEmployee)}</td>
        <td class="num">${usd(line.nisEmployer)}</td>
        <td class="num">${usd(govt)}</td>
      </tr>`
    })
    .join('')
  const staff = rows.reduce((s, line) => s + line.nisEmployee, 0)
  const employer = rows.reduce((s, line) => s + line.nisEmployer, 0)
  const printed = new Date().toLocaleDateString('en-US')
  printWin.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>N.I.S. ${escapePayPeriodHtml(mdy(input.startDate))} - ${escapePayPeriodHtml(mdy(input.endDate))}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; margin: 32px; }
      h1 { display: inline-block; border: 3px solid #111; padding: 4px 14px; letter-spacing: 0.08em; }
      .meta { display: flex; justify-content: space-between; gap: 16px; margin: 8px 0 28px; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { text-align: right; font-weight: 600; padding: 4px 8px 8px; }
      th:first-child, td:first-child { text-align: left; }
      td { padding: 3px 8px; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      tfoot td { border-top: 2px solid #111; font-weight: 600; padding-top: 6px; }
      .foot { margin-top: 48px; text-align: right; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>N.I.S.</h1>
    ${input.voided ? '<p><strong>VOIDED.</strong> This report is a record only and is not filed.</p>' : ''}
    <div class="meta">
      <span>PERIOD: ${escapePayPeriodHtml(mdy(input.startDate))} - ${escapePayPeriodHtml(mdy(input.endDate))}</span>
      <span>CYCLE: ${escapePayPeriodHtml(payCycleLabel(input.cycle))}</span>
      <span>FOR: ${escapePayPeriodHtml(monthLabel(input.endDate))}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>NAME</th>
          <th>CHARGE</th>
          <th>STAFF</th>
          <th>EMPLOYER</th>
          <th>GOVT TTL</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr>
          <td></td>
          <td class="num">${usd(staff)}</td>
          <td class="num">${usd(staff)}</td>
          <td class="num">${usd(employer)}</td>
          <td class="num">${usd(staff + employer)}</td>
        </tr>
      </tfoot>
    </table>
    <p class="foot">PRINTED: ${escapePayPeriodHtml(printed)}</p>
  </body>
</html>`)
  printWin.document.close()
  printWin.focus()
  printWin.print()
}

export function printPayrollPreview(input: {
  startDate: string
  endDate: string
  payDate: string
  status?: string
  voidReason?: string
  lines: PayrollPreviewLine[]
}) {
  const printWin = window.open('', '_blank')
  if (!printWin) return
  const hourly = input.lines.filter((line) => line.payType !== 'salaried')
  const salaried = input.lines.filter((line) => line.payType === 'salaried')
  const section = (title: string, lines: PayrollPreviewLine[]) => {
    if (lines.length === 0) return ''
    const body = lines
      .map(
        (line) => `<tr>
          <td>${escapePayPeriodHtml(line.staffName)}</td>
          <td class="num">${line.payType === 'salaried' ? '—' : usd(line.hours)}</td>
          <td class="num">${formatMoney(line.grossPay)}</td>
          <td class="num">${formatMoney(line.netPay)}</td>
        </tr>`
      )
      .join('')
    const hours = lines.reduce((s, line) => s + (line.payType === 'salaried' ? 0 : line.hours), 0)
    const gross = lines.reduce((s, line) => s + line.grossPay, 0)
    const net = lines.reduce((s, line) => s + line.netPay, 0)
    return `<h2>${escapePayPeriodHtml(title)}</h2>
      <table>
        <thead><tr><th>Name</th><th>Total hours</th><th>Gross pay</th><th>Net pay</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td>Subtotal</td><td class="num">${usd(hours)}</td><td class="num">${formatMoney(gross)}</td><td class="num">${formatMoney(net)}</td></tr></tfoot>
      </table>`
  }
  const banner =
    input.status === 'void'
      ? `VOIDED${input.voidReason ? `: ${escapePayPeriodHtml(input.voidReason)}` : ''}. Record only.`
      : input.status === 'processed'
        ? 'Approved.'
        : 'Not approved.'
  const hours = input.lines.reduce((s, line) => s + (line.payType === 'salaried' ? 0 : line.hours), 0)
  const gross = input.lines.reduce((s, line) => s + line.grossPay, 0)
  const net = input.lines.reduce((s, line) => s + line.netPay, 0)
  printWin.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Payroll preview</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 32px; color: #111; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
      th:not(:first-child), td.num { text-align: right; }
      tfoot td { font-weight: 600; }
      .banner { background: #f5f3ff; padding: 12px 16px; margin-bottom: 20px; }
    </style>
  </head>
  <body>
    <h1>Payroll preview</h1>
    <p class="banner">Pay period ${escapePayPeriodHtml(mdy(input.startDate))} – ${escapePayPeriodHtml(mdy(input.endDate))} · Pay date ${escapePayPeriodHtml(mdy(input.payDate))}. ${banner}</p>
    ${section('Hourly employees', hourly)}
    ${section('Salaried employees', salaried)}
    <p><strong>Total hours</strong> ${usd(hours)} · <strong>Gross</strong> ${formatMoney(gross)} · <strong>Net</strong> ${formatMoney(net)}</p>
    <p>PAYE is still calculated in Pay+.</p>
  </body>
</html>`)
  printWin.document.close()
  printWin.focus()
  printWin.print()
}
