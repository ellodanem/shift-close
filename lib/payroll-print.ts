import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { parsePayCycle, payPeriodCycleNumber } from '@/lib/pay-cycle'
import { escapePayPeriodHtml } from '@/lib/pay-period-email'
import { normalizePayslipCompanyName } from '@/lib/payroll-settings'
import { OT_MULTIPLIER, formatMoney, visibleExtraLines, type PayRunExtraLine } from '@/lib/pay-run'

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
      <span>CYCLE: ${escapePayPeriodHtml(input.cycle)}</span>
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

export type PayrollPreviewInput = {
  startDate: string
  endDate: string
  payDate: string
  status?: string
  voidReason?: string
  lines: PayrollPreviewLine[]
}

export function payrollPreviewStatus(input: Pick<PayrollPreviewInput, 'status' | 'voidReason'>): string {
  if (input.status === 'void') {
    return `VOIDED${input.voidReason ? `: ${input.voidReason}` : ''}. Record only.`
  }
  if (input.status === 'processed') return 'Approved.'
  return 'Not approved.'
}

export function payrollPreviewFilename(input: Pick<PayrollPreviewInput, 'startDate' | 'endDate'>): string {
  return `payroll-preview-${input.startDate}-${input.endDate}.pdf`
}

function previewSections(lines: PayrollPreviewLine[]) {
  return [
    { title: 'Hourly employees', lines: lines.filter((line) => line.payType !== 'salaried') },
    { title: 'Salaried employees', lines: lines.filter((line) => line.payType === 'salaried') }
  ].filter((section) => section.lines.length > 0)
}

function sectionTotals(lines: PayrollPreviewLine[]) {
  return {
    hours: lines.reduce((sum, line) => sum + (line.payType === 'salaried' ? 0 : line.hours), 0),
    gross: lines.reduce((sum, line) => sum + line.grossPay, 0),
    net: lines.reduce((sum, line) => sum + line.netPay, 0)
  }
}

function hoursCell(line: PayrollPreviewLine): string {
  return line.payType === 'salaried' ? '—' : usd(line.hours)
}

export type PayslipAmount = {
  label: string
  amount: number
  rate?: number
  hours?: number
  ytd?: number
}

export type PayslipYtd = {
  basicPay: number
  otPay: number
  extraPay: number
  grossPay: number
  nisEmployee: number
  staffLoan: number
  medical: number
  shortageReady: number
  extraDeductionPay: number
  totalDeductions: number
  netPay: number
}

export type PayslipLine = {
  staffName: string
  nisNumber: string
  taxCode: string
  earnings: PayslipAmount[]
  deductions: PayslipAmount[]
  grossPay: number
  grossYtd: number
  totalDeductions: number
  deductionsYtd: number
  netPay: number
  bankLabel: string
  periodLabel: string
}

export type PayslipSourceLine = {
  staffName: string
  staffNo?: string | null
  taxCode?: string | null
  payType?: string | null
  payCycle?: string | null
  hourlyRate?: number | null
  basicHours?: number | null
  otHours?: number | null
  basicPay: number
  otPay: number
  extraLines?: PayRunExtraLine[] | null
  extraDeductions?: PayRunExtraLine[] | null
  nisEmployee: number
  medical: number
  staffLoan: number
  shortageReady: number
  grossPay: number
  totalDeductions: number
  netPay: number
  ytd?: PayslipYtd | null
  bankCode?: string | null
  accountNo?: string | null
}

export type PayslipPrintInput = {
  startDate: string
  endDate: string
  payDate: string
  /** Pay+ period number. Falls back to the number implied by the period end. */
  cycleNumber?: number
  /** Printed at the bottom of each payslip. Defaults to Total Auto. */
  companyName?: string
  status?: string
  voidReason?: string
  lines: PayslipSourceLine[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function plainMoney(n: number): string {
  return round2(n).toFixed(2)
}

function pushAmount(rows: PayslipAmount[], label: string, amount: number, extra?: Partial<PayslipAmount>) {
  const n = round2(amount)
  if (!Number.isFinite(n) || n === 0) return
  const row: PayslipAmount = { label, amount: n }
  if (extra?.rate) row.rate = round2(extra.rate)
  if (extra?.hours) row.hours = round2(extra.hours)
  if (extra?.ytd !== undefined && Number.isFinite(extra.ytd)) row.ytd = round2(extra.ytd)
  rows.push(row)
}

export { payPeriodCycleNumber } from '@/lib/pay-cycle'

/** @deprecated Use payPeriodCycleNumber. Kept so older checks of the end day still run. */
export function payPeriodCycleDay(endDate: string): string {
  const day = endDate.split('-')[2]
  if (!day || !/^\d{1,2}$/.test(day)) return ''
  return String(Number(day))
}

function payslipPeriodName(cycle: unknown): string {
  switch (parsePayCycle(cycle)) {
    case 'weekly':
      return 'Weekly'
    case 'biweekly':
      return 'Bi-weekly'
    case 'monthly':
      return 'Monthly'
    default:
      return 'Bi-monthly'
  }
}

function payslipBankLabel(code?: string | null, account?: string | null): string {
  const raw = (code ?? '').trim().toUpperCase()
  const accountNo = (account ?? '').trim()
  const short = raw === 'REPUBLIC' ? 'REP' : raw
  if (!short && !accountNo) return ''
  if (!accountNo) return short
  return `${short || 'BANK'} ( ${accountNo} )`
}

function ytdOrCurrent(ytd: number | undefined, current: number): number {
  return round2(ytd ?? current)
}

export function buildPayslipLine(line: PayslipSourceLine): PayslipLine | null {
  const hourly = line.payType === 'hourly'
  const hourlyRate = line.hourlyRate && line.hourlyRate > 0 ? round2(line.hourlyRate) : undefined
  const ytd = line.ytd
  const earnings: PayslipAmount[] = []
  pushAmount(earnings, 'Basic', line.basicPay, {
    rate: hourly ? hourlyRate : undefined,
    hours: hourly && line.basicHours ? line.basicHours : undefined,
    ytd: ytdOrCurrent(ytd?.basicPay, line.basicPay)
  })
  pushAmount(earnings, 'Overtime', line.otPay, {
    rate: hourly && hourlyRate ? round2(hourlyRate * OT_MULTIPLIER) : undefined,
    hours: line.otHours || undefined,
    ytd: ytdOrCurrent(ytd?.otPay, line.otPay)
  })
  const extraEarnings = visibleExtraLines(line.extraLines ?? [])
  for (const extra of extraEarnings) {
    pushAmount(earnings, extra.label || 'Extra', extra.amount, {
      hours: extra.hours,
      rate: extra.hours && hourlyRate ? hourlyRate : undefined,
      ytd: extraEarnings.length === 1 ? ytd?.extraPay : undefined
    })
  }
  if (earnings.length === 0 && round2(line.grossPay) !== 0) {
    pushAmount(earnings, 'Basic', line.grossPay, { ytd: ytdOrCurrent(ytd?.grossPay, line.grossPay) })
  }

  const deductions: PayslipAmount[] = []
  const extras = line.extraDeductions ?? []
  const paye = extras.filter((extra) => {
    const key = labelKey(extra.label)
    return key === 'paye' || key === 'payetax'
  })
  const otherExtras = extras.filter((extra) => !paye.includes(extra))
  for (const extra of paye) {
    pushAmount(deductions, 'P.A.Y.E.', extra.amount, {
      ytd: paye.length === 1 ? ytd?.extraDeductionPay : undefined
    })
  }
  pushAmount(deductions, 'N.I.S.', line.nisEmployee, { ytd: ytdOrCurrent(ytd?.nisEmployee, line.nisEmployee) })
  pushAmount(deductions, 'Medical Insurance', line.medical, { ytd: ytdOrCurrent(ytd?.medical, line.medical) })
  pushAmount(deductions, 'Staff Loan', line.staffLoan, { ytd: ytdOrCurrent(ytd?.staffLoan, line.staffLoan) })
  pushAmount(deductions, 'Shortage', line.shortageReady, { ytd: ytdOrCurrent(ytd?.shortageReady, line.shortageReady) })
  for (const extra of otherExtras) {
    pushAmount(deductions, extra.label || 'Other', extra.amount, {
      ytd: otherExtras.length === 1 && paye.length === 0 ? ytd?.extraDeductionPay : undefined
    })
  }

  const grossPay = round2(line.grossPay)
  const totalDeductions = round2(line.totalDeductions)
  const netPay = round2(line.netPay)
  if (earnings.length === 0 && deductions.length === 0 && netPay === 0 && grossPay === 0) return null

  return {
    staffName: line.staffName.trim() || 'Staff',
    nisNumber: (line.staffNo ?? '').trim(),
    taxCode: (line.taxCode ?? '').trim(),
    earnings,
    deductions,
    grossPay,
    grossYtd: ytdOrCurrent(ytd?.grossPay, grossPay),
    totalDeductions,
    deductionsYtd: ytdOrCurrent(ytd?.totalDeductions, totalDeductions),
    netPay,
    bankLabel: payslipBankLabel(line.bankCode, line.accountNo),
    periodLabel: payslipPeriodName(line.payCycle)
  }
}

function payslipPages(lines: PayslipLine[]): PayslipLine[][] {
  const pages: PayslipLine[][] = []
  let current: PayslipLine[] = []
  let used = 0
  const pageBody = 820
  for (const line of lines) {
    const rows = Math.max(line.earnings.length, line.deductions.length, 1)
    const height = 150 + rows * 14
    if (current.length >= 3 || (current.length > 0 && used + height > pageBody)) {
      pages.push(current)
      current = []
      used = 0
    }
    current.push(line)
    used += height
  }
  if (current.length > 0) pages.push(current)
  return pages.length > 0 ? pages : [[]]
}

export type PayslipPeriodTotals = {
  earnings: number
  deductions: number
  basic: number
  nis: number
  paye: number
  bonus: number
  net: number
}

function labelKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z]/g, '')
}

/** Register totals for the last payslip page. One run, so period and grand totals match. */
export function buildPayslipPeriodTotals(lines: PayslipSourceLine[]): PayslipPeriodTotals {
  const totals: PayslipPeriodTotals = {
    earnings: 0,
    deductions: 0,
    basic: 0,
    nis: 0,
    paye: 0,
    bonus: 0,
    net: 0
  }
  for (const line of lines) {
    totals.earnings += line.grossPay
    totals.deductions += line.totalDeductions
    totals.basic += line.basicPay
    totals.nis += line.nisEmployee
    totals.net += line.netPay
    for (const extra of visibleExtraLines(line.extraLines ?? [])) {
      if (labelKey(extra.label) === 'bonus') totals.bonus += extra.amount
    }
    for (const extra of line.extraDeductions ?? []) {
      const key = labelKey(extra.label)
      if (key === 'paye' || key === 'payetax') totals.paye += extra.amount
    }
  }
  ;(Object.keys(totals) as (keyof PayslipPeriodTotals)[]).forEach((key) => {
    totals[key] = round2(totals[key])
  })
  return totals
}

function cellQty(value: number | undefined): string {
  return value ? plainMoney(value) : ''
}

function slipHtml(
  line: PayslipLine,
  payDate: string,
  cycleDay: string,
  periodRange: string,
  companyName: string
): string {
  const count = Math.max(line.earnings.length, line.deductions.length, 1)
  const itemRows = Array.from({ length: count }, (_, index) => {
    const earning = line.earnings[index]
    const deduction = line.deductions[index]
    return `<tr>
      <td>${earning ? escapePayPeriodHtml(earning.label) : ''}</td>
      <td class="num">${cellQty(earning?.rate)}</td>
      <td class="num">${cellQty(earning?.hours)}</td>
      <td class="num">${earning ? plainMoney(earning.amount) : ''}</td>
      <td class="num">${cellQty(earning?.ytd)}</td>
      <td class="ded">${deduction ? escapePayPeriodHtml(deduction.label) : ''}</td>
      <td class="num">${deduction ? plainMoney(deduction.amount) : ''}</td>
      <td class="num">${cellQty(deduction?.ytd)}</td>
      <td></td>
    </tr>`
  }).join('')
  const bank = line.bankLabel
    ? `<div><span class="k">BANK:</span> ${escapePayPeriodHtml(line.bankLabel)}</div>`
    : ''
  return `<article class="slip">
    <div class="id-row">
      <div class="payee"><span class="lbl">PAYEE:</span> ${escapePayPeriodHtml(line.staffName)}</div>
      <div><span class="lbl">PAY DATE:</span> ${escapePayPeriodHtml(payDate)}</div>
      <div><span class="lbl">PAY CYCLE:</span> ${escapePayPeriodHtml(cycleDay)}</div>
      <div><span class="lbl">TAX CODE:</span> ${escapePayPeriodHtml(line.taxCode)}</div>
      <div><span class="lbl">NIS #:</span> ${escapePayPeriodHtml(line.nisNumber)}</div>
      <div class="nis-box">${escapePayPeriodHtml(line.nisNumber)}</div>
    </div>
    <table class="grid">
      <colgroup>
        <col class="c-earn" /><col class="c-rate" /><col class="c-hours" /><col class="c-amt" /><col class="c-ytd" />
        <col class="c-ded" /><col class="c-amt" /><col class="c-ytd" /><col class="c-bal" />
      </colgroup>
      <thead>
        <tr>
          <th>EARNINGS</th><th class="num">RATE</th><th class="num">HOURS</th><th class="num">AMOUNT</th><th class="num">YTD</th>
          <th class="ded">DEDUCTIONS</th><th class="num">AMOUNT</th><th class="num">YTD</th><th class="num">BALANCE</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr>
          <td class="net-label" colspan="2">NET :</td>
          <td class="net-box">${plainMoney(line.netPay)}</td>
          <td class="num">${plainMoney(line.grossPay)}</td>
          <td class="num">${plainMoney(line.grossYtd)}</td>
          <td></td>
          <td class="num">${line.totalDeductions ? plainMoney(line.totalDeductions) : ''}</td>
          <td class="num">${line.deductionsYtd ? plainMoney(line.deductionsYtd) : ''}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <div class="slip-foot">
      <div class="company">
        <div>${escapePayPeriodHtml(companyName)}</div>
        <div>John Compton Highway Castries, Saint Lucia</div>
        <div>758 4515400</div>
      </div>
      <div class="place">
        <div><span class="k">CENTRE:</span> CUL DE SAC</div>
        ${bank}
        <div><span class="k">PERIOD:</span> ${escapePayPeriodHtml(line.periodLabel)} ( ${escapePayPeriodHtml(periodRange)} )</div>
      </div>
    </div>
  </article>`
}

export function renderPayslipsHtml(input: PayslipPrintInput): string {
  const slips = input.lines.flatMap((line) => {
    const slip = buildPayslipLine(line)
    return slip ? [slip] : []
  })
  const payDate = mdy(input.payDate)
  const cycleDay =
    input.cycleNumber && input.cycleNumber > 0
      ? String(input.cycleNumber)
      : payPeriodCycleNumber(input.endDate)
  const period = `${mdy(input.startDate)} - ${mdy(input.endDate)}`
  const printed = new Date()
  const printedLabel = `${String(printed.getMonth() + 1).padStart(2, '0')}/${String(printed.getDate()).padStart(2, '0')}/${printed.getFullYear()}`
  const voided =
    input.status === 'void'
      ? `<p class="void">VOIDED${input.voidReason ? `: ${escapePayPeriodHtml(input.voidReason)}` : ''}. Record only.</p>`
      : ''
  const companyName = normalizePayslipCompanyName(input.companyName)
  const pages = payslipPages(slips)
  const totals = buildPayslipPeriodTotals(input.lines)
  const totalsPage = `<section class="page">
        <header class="banner">
          <div class="reg-title">Pay Register ( ANALYSIS )</div>
          <div class="banner-range reg-range">${escapePayPeriodHtml(period)}</div>
          ${voided}
        </header>
        <div class="reg-pair period">
          <span>PERIODTOTALS :</span>
          <span>${plainMoney(totals.earnings)}</span>
          <span>${plainMoney(totals.deductions)}</span>
        </div>
        <div class="reg-pair grand">
          <span>GRAND TOTALS :</span>
          <span>${plainMoney(totals.earnings)}</span>
          <span>${plainMoney(totals.deductions)}</span>
        </div>
        <div class="reg-break">
          <div><span>BASIC :</span><span>${plainMoney(totals.basic)}</span></div>
          <div><span>NIS :</span><span>${plainMoney(totals.nis)}</span></div>
          <div><span>PAYE :</span><span>${plainMoney(totals.paye)}</span></div>
          <div><span>BONUS :</span><span>${plainMoney(totals.bonus)}</span></div>
          <div><span>NET :</span><span>${plainMoney(totals.net)}</span></div>
        </div>
        <footer>Printed: ${printedLabel}<span>Page: ${pages.length + 1}</span></footer>
      </section>`
  const body =
    pages
      .map((page, index) => {
        const content =
          page.length > 0
            ? page.map((line) => slipHtml(line, payDate, cycleDay, period, companyName)).join('')
            : '<p class="empty">No payslips for this payroll.</p>'
        return `<section class="page">
        ${voided}
        ${content}
        <footer>Printed: ${printedLabel}<span>Page: ${index + 1}</span></footer>
      </section>`
      })
      .join('') + totalsPage

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Payslips ${escapePayPeriodHtml(period)}</title>
    <style>
      @page { size: letter; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
      .page {
        position: relative;
        width: 8.5in;
        height: 11in;
        padding: 0.4in 0.48in 0.36in;
        page-break-after: always;
        overflow: hidden;
      }
      .page:last-child { page-break-after: auto; }
      .banner-title {
        display: inline-block;
        border: 2px solid #111;
        border-bottom-width: 4px;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 0.02em;
        padding: 1px 10px 0;
      }
      .banner-range { margin-top: 3px; font-size: 12px; }
      .reg-title {
        display: inline-block;
        color: #e10600;
        border: 2px solid #111;
        border-bottom-width: 5px;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.01em;
        padding: 1px 8px 0;
      }
      .reg-range { text-align: center; width: 280px; }
      .reg-pair, .reg-break div {
        display: grid;
        grid-template-columns: 168px 120px 120px;
        font-weight: 700;
        font-size: 13px;
      }
      .reg-pair span:not(:first-child), .reg-break span:last-child { text-align: right; font-variant-numeric: tabular-nums; }
      .period { color: #0000cc; margin-top: 28px; }
      .grand { color: #e10600; margin-top: 42px; }
      .reg-break { margin-top: 36px; color: #e10600; }
      .reg-break div + div { margin-top: 10px; }
      .void { margin: 4px 0 0; font-weight: 700; }
      .empty { margin-top: 24px; }
      .slip { margin-top: 16px; page-break-inside: avoid; }
      .slip:first-child { margin-top: 0; }
      .id-row {
        width: 100%;
        display: grid;
        grid-template-columns: minmax(120px, 1.35fr) auto auto auto auto auto;
        align-items: center;
        column-gap: 8px;
        font-size: 10px;
        border-bottom: 1px solid #111;
        padding-bottom: 2px;
      }
      .id-row > div { white-space: nowrap; }
      .payee { overflow: hidden; text-overflow: ellipsis; }
      .lbl { font-weight: 700; }
      .nis-box {
        justify-self: end;
        border: 1.5px solid #111;
        min-width: 58px;
        padding: 1px 5px;
        text-align: center;
        font-weight: 700;
      }
      .grid { width: 100%; border-collapse: collapse; margin-top: 2px; }
      .grid th, .grid td { padding: 1px 4px 1px 0; text-align: left; font-weight: 400; vertical-align: baseline; }
      .grid th { font-weight: 700; }
      .c-earn { width: 16%; }
      .c-rate, .c-hours { width: 7%; }
      .c-amt { width: 11%; }
      .c-ytd { width: 12%; }
      .c-ded { width: 16%; }
      .c-bal { width: 8%; }
      .ded { padding-left: 8px; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .grid tfoot td { border-top: 1px solid #111; border-bottom: 1px solid #111; padding-top: 2px; padding-bottom: 2px; }
      .net-label { color: #0000cc; font-weight: 700; border-bottom: 0; }
      .net-box {
        color: #0000cc;
        font-weight: 700;
        text-align: center;
        border: 1.5px solid #111;
        width: 1%;
        white-space: nowrap;
      }
      .slip-foot { display: flex; justify-content: space-between; gap: 16px; margin-top: 3px; font-size: 9px; }
      .company { text-align: center; flex: 1; }
      .place { color: #0000cc; text-align: right; font-style: italic; }
      .place .k { font-style: italic; font-weight: 700; }
      footer { position: absolute; right: 0.48in; bottom: 0.28in; font-size: 11px; }
      footer span { margin-left: 16px; }
    </style>
  </head>
  <body>${body}</body>
</html>`
}

export function printPayslips(input: PayslipPrintInput): boolean {
  const printWin = window.open('', '_blank')
  if (!printWin) return false
  printWin.document.write(renderPayslipsHtml(input))
  printWin.document.close()
  printWin.focus()
  printWin.print()
  return true
}

const GL_CENTRE = 'CUL DE SAC'
const GL_DEPT = '004'
const GL_EARNING_ORDER = ['Basic', 'Overtime', 'Commission', 'Add duties']
const GL_DEDUCTION_ORDER = [
  'P.A.Y.E.',
  'N.I.S.',
  'Staff Loan',
  'CARED Loan',
  'Medical Insurance',
  'Republic Bank',
  'Shortage'
]

export type GlSummary = {
  centre: string
  dept: string
  earnings: PayslipAmount[]
  deductions: PayslipAmount[]
  earningsTotal: number
  deductionsTotal: number
}

function glDate(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${Number(m)}/${Number(d)}/${y}`
}

function glEarningLabel(label: string): string {
  const key = label.trim().toLowerCase().replace(/[^a-z]/g, '')
  if (key === 'basic' || key === 'bsc') return 'Basic'
  if (key === 'overtime' || key === 'ot' || key === 'oth') return 'Overtime'
  if (key === 'commission') return 'Commission'
  if (key === 'addduties' || key === 'addduty') return 'Add duties'
  return label.trim() || 'Extra'
}

function glDeductionLabel(label: string): string {
  const key = label.trim().toLowerCase().replace(/[^a-z]/g, '')
  if (key === 'paye') return 'P.A.Y.E.'
  if (key === 'nis' || key === 'nic') return 'N.I.S.'
  if (key === 'medical' || key === 'medicalinsurance') return 'Medical Insurance'
  if (key === 'staffloan' || key === 'loan') return 'Staff Loan'
  if (key === 'cared' || key === 'caredloan') return 'CARED Loan'
  if (key === 'republic' || key === 'republicbank') return 'Republic Bank'
  if (key === 'shortage') return 'Shortage'
  return label.trim() || 'Other'
}

function orderGlAmounts(rows: PayslipAmount[], order: string[]): PayslipAmount[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.label, round2((totals.get(row.label) ?? 0) + row.amount))
  }
  return [...totals.keys()]
    .sort((a, b) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    .map((label) => ({ label, amount: totals.get(label) ?? 0 }))
}

/** Station G/L analysis. This payroll is Cul de Sac, department 004. */
export function buildGlSummary(lines: PayslipSourceLine[]): GlSummary {
  const earnings: PayslipAmount[] = []
  const deductions: PayslipAmount[] = []
  for (const line of lines) {
    const slip = buildPayslipLine(line)
    if (!slip) continue
    for (const row of slip.earnings) earnings.push({ label: glEarningLabel(row.label), amount: row.amount })
    for (const row of slip.deductions) deductions.push({ label: glDeductionLabel(row.label), amount: row.amount })
  }
  const orderedEarnings = orderGlAmounts(earnings, GL_EARNING_ORDER)
  const orderedDeductions = orderGlAmounts(deductions, GL_DEDUCTION_ORDER)
  return {
    centre: GL_CENTRE,
    dept: GL_DEPT,
    earnings: orderedEarnings,
    deductions: orderedDeductions,
    earningsTotal: round2(orderedEarnings.reduce((sum, row) => sum + row.amount, 0)),
    deductionsTotal: round2(orderedDeductions.reduce((sum, row) => sum + row.amount, 0))
  }
}

function glPairRows(earnings: PayslipAmount[], deductions: PayslipAmount[]): string {
  const count = Math.max(earnings.length, deductions.length, 1)
  const rows: string[] = []
  for (let i = 0; i < count; i++) {
    const earning = earnings[i]
    const deduction = deductions[i]
    rows.push(`<tr>
      <td>${earning ? escapePayPeriodHtml(earning.label) : ''}</td>
      <td class="amt">${earning ? plainMoney(earning.amount) : ''}</td>
      <td class="ded">${deduction ? escapePayPeriodHtml(deduction.label) : ''}</td>
      <td class="amt">${deduction ? plainMoney(deduction.amount) : ''}</td>
    </tr>`)
  }
  return rows.join('')
}

export function renderGlHtml(input: PayslipPrintInput): string {
  const summary = buildGlSummary(input.lines)
  const period = `${glDate(input.startDate)} - ${glDate(input.endDate)}`
  const printed = new Date()
  const printedLabel = `${String(printed.getMonth() + 1).padStart(2, '0')}/${String(printed.getDate()).padStart(2, '0')}/${printed.getFullYear()}`
  const voided =
    input.status === 'void'
      ? `<p class="void">VOIDED${input.voidReason ? `: ${escapePayPeriodHtml(input.voidReason)}` : ''}. Record only.</p>`
      : ''
  const banner = `<header class="banner">
    <h1>G/L Accounts ( ANALYSIS )</h1>
    <p class="range">${escapePayPeriodHtml(period)}</p>
    ${voided}
  </header>`
  const centrePage = `<section class="page">
    ${banner}
    <p class="place"><span>CENTRE:</span> ${escapePayPeriodHtml(summary.centre)}</p>
    <p class="place dept"><span>DEPT:</span> ${escapePayPeriodHtml(summary.dept)}</p>
    <table>
      <thead>
        <tr>
          <th class="cat">EARNINGS</th>
          <th class="amt">AMOUNT</th>
          <th class="cat ded">DEDUCTIONS</th>
          <th class="amt">AMOUNT</th>
        </tr>
      </thead>
      <tbody>${glPairRows(summary.earnings, summary.deductions)}</tbody>
      <tfoot>
        <tr>
          <td></td>
          <td class="amt">${plainMoney(summary.earningsTotal)}</td>
          <td></td>
          <td class="amt">${plainMoney(summary.deductionsTotal)}</td>
        </tr>
      </tfoot>
    </table>
    <p class="centre-totals">
      <span>CENTRETOTALS :</span>
      <span class="amt">${plainMoney(summary.earningsTotal)}</span>
      <span></span>
      <span class="amt">${plainMoney(summary.deductionsTotal)}</span>
    </p>
    <footer>Printed: ${printedLabel}<span>Page: 1</span></footer>
  </section>`
  const grandPage = `<section class="page">
    ${banner}
    <p class="grand-totals">
      <span>GRAND TOTALS :</span>
      <span class="amt">${plainMoney(summary.earningsTotal)}</span>
      <span></span>
      <span class="amt">${plainMoney(summary.deductionsTotal)}</span>
    </p>
    <footer>Printed: ${printedLabel}<span>Page: 2</span></footer>
  </section>`

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>G/L Accounts ${escapePayPeriodHtml(period)}</title>
    <style>
      @page { size: letter; margin: 0.5in 0.55in 0.45in; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
      .page { position: relative; min-height: 9.6in; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .banner { display: inline-block; }
      h1 {
        display: inline-block;
        margin: 0;
        color: #e10600;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.01em;
        border: 3px solid #111;
        padding: 1px 8px 0;
      }
      .range { margin: 4px 0 0; text-align: center; font-size: 13px; }
      .void { margin: 4px 0 0; font-weight: 700; text-align: center; }
      .place { margin: 16px 0 0; color: #0000cc; font-weight: 700; font-size: 14px; }
      .place span { text-decoration: underline; display: inline-block; min-width: 78px; }
      .dept { margin-top: 10px; }
      table { width: 100%; border-collapse: collapse; margin-top: 26px; }
      th, td { padding: 2px 8px 2px 0; text-align: left; font-weight: 400; }
      th { font-weight: 700; padding-bottom: 10px; }
      th.cat { text-decoration: underline; }
      th.ded, td.ded { padding-left: 36px; }
      .amt { text-align: right; font-variant-numeric: tabular-nums; width: 18%; }
      tfoot td { padding-top: 8px; }
      tfoot .amt { border-top: 1px solid #111; }
      .centre-totals, .grand-totals {
        display: grid;
        grid-template-columns: 1.15fr 0.7fr 1.15fr 0.7fr;
        margin-top: 22px;
        color: #0000cc;
        font-weight: 700;
        font-size: 14px;
      }
      .grand-totals { margin-top: 36px; }
      .centre-totals .amt, .grand-totals .amt { text-align: right; }
      footer { position: absolute; right: 0; bottom: 0; font-size: 12px; }
      footer span { margin-left: 28px; }
    </style>
  </head>
  <body>${centrePage}${grandPage}</body>
</html>`
}

export function printGlReport(input: PayslipPrintInput): boolean {
  const printWin = window.open('', '_blank')
  if (!printWin) return false
  printWin.document.write(renderGlHtml(input))
  printWin.document.close()
  printWin.focus()
  printWin.print()
  return true
}

export function printPayrollPreview(input: PayrollPreviewInput): boolean {
  const printWin = window.open('', '_blank')
  if (!printWin) return false
  const section = (title: string, lines: PayrollPreviewLine[]) => {
    const body = lines
      .map(
        (line) => `<tr>
          <td>${escapePayPeriodHtml(line.staffName)}</td>
          <td class="num">${hoursCell(line)}</td>
          <td class="num">${formatMoney(line.grossPay)}</td>
          <td class="num">${formatMoney(line.netPay)}</td>
        </tr>`
      )
      .join('')
    const totals = sectionTotals(lines)
    return `<h2>${escapePayPeriodHtml(title)}</h2>
      <table>
        <thead><tr><th>Name</th><th>Total hours</th><th>Gross pay</th><th>Net pay</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td>Subtotal</td><td class="num">${usd(totals.hours)}</td><td class="num">${formatMoney(totals.gross)}</td><td class="num">${formatMoney(totals.net)}</td></tr></tfoot>
      </table>`
  }
  const totals = sectionTotals(input.lines)
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
    <p class="banner">Pay period ${escapePayPeriodHtml(mdy(input.startDate))} – ${escapePayPeriodHtml(mdy(input.endDate))} · Pay date ${escapePayPeriodHtml(mdy(input.payDate))}. ${escapePayPeriodHtml(payrollPreviewStatus(input))}</p>
    ${previewSections(input.lines).map((item) => section(item.title, item.lines)).join('')}
    <p><strong>Total hours</strong> ${usd(totals.hours)} · <strong>Gross</strong> ${formatMoney(totals.gross)} · <strong>Net</strong> ${formatMoney(totals.net)}</p>
    <p>PAYE is still calculated in Pay+.</p>
  </body>
</html>`)
  printWin.document.close()
  printWin.focus()
  printWin.print()
  return true
}

export function downloadPayrollPreview(input: PayrollPreviewInput) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const margin = 40
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Payroll preview', margin, 48)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(55)
  doc.text(
    `Pay period ${mdy(input.startDate)} – ${mdy(input.endDate)}  ·  Pay date ${mdy(input.payDate)}`,
    margin,
    68
  )
  doc.text(payrollPreviewStatus(input), margin, 84)
  doc.setTextColor(0)

  let y = 100
  for (const section of previewSections(input.lines)) {
    const totals = sectionTotals(section.lines)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(section.title, margin, y)
    autoTable(doc, {
      startY: y + 8,
      head: [['Name', 'Total hours', 'Gross pay', 'Net pay']],
      body: section.lines.map((line) => [
        line.staffName,
        hoursCell(line),
        formatMoney(line.grossPay),
        formatMoney(line.netPay)
      ]),
      foot: [['Subtotal', usd(totals.hours), formatMoney(totals.gross), formatMoney(totals.net)]],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [91, 33, 182], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [245, 243, 255], textColor: [17, 24, 39], fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      },
      margin: { left: margin, right: margin }
    })
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 28
  }

  const totals = sectionTotals(input.lines)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(17)
  doc.text(
    `Total hours ${usd(totals.hours)}    Gross ${formatMoney(totals.gross)}    Net ${formatMoney(totals.net)}`,
    margin,
    y
  )
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text('PAYE is still calculated in Pay+.', margin, y + 16)
  doc.save(payrollPreviewFilename(input))
}
