import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { parsePayCycle, payPeriodCycleNumber } from '@/lib/pay-cycle'
import { escapePayPeriodHtml } from '@/lib/pay-period-email'
import { normalizePayslipCompany } from '@/lib/payroll-settings'
import { formatMoney, parseMoney, parsePayType, visibleExtraLines, type PayRunExtraLine } from '@/lib/pay-run'

export type NisPrintLine = {
  staffName: string
  staffNo: string | null
  nisEmployee: number
  nisEmployer: number
  grossPay: number
}

export type PayrollPreviewDeduction = {
  label: string
  amount: number
  ytd: number
}

export type PayrollPreviewLine = {
  staffName: string
  payType: string
  taxCode: string
  hours: number
  grossPay: number
  totalDeductions: number
  netPay: number
  basicHours: number
  basicPay: number
  basicYtd: number
  otHours: number
  otPay: number
  otYtd: number
  extraPay: number
  extraYtd: number
  grossYtd: number
  deductions: PayrollPreviewDeduction[]
  deductionsYtd: number
  netYtd: number
  nisEmployer: number
  bankCode: string
  accountNo: string
}

export type PayrollPreviewSourceLine = {
  staffName: string
  payType: string
  taxCode?: string | null
  basicHours: number
  otHours: number
  basicPay: number
  otPay: number
  extraPay: number
  grossPay: number
  nisEmployee: number
  staffLoan: number
  medical: number
  shortageReady: number
  extraDeductionPay?: number
  totalDeductions: number
  netPay: number
  nisEmployer: number
  bankCode?: string | null
  accountNo?: string | null
  ytd?: {
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
    { title: 'Hourly employees', lines: lines.filter((line) => parsePayType(line.payType) !== 'salaried') },
    { title: 'Salaried employees', lines: lines.filter((line) => parsePayType(line.payType) === 'salaried') }
  ].filter((section) => section.lines.length > 0)
}

function sectionTotals(lines: PayrollPreviewLine[]) {
  return {
    hours: lines.reduce((sum, line) => sum + line.hours, 0),
    gross: lines.reduce((sum, line) => sum + line.grossPay, 0),
    deductions: lines.reduce((sum, line) => sum + line.totalDeductions, 0),
    net: lines.reduce((sum, line) => sum + line.netPay, 0)
  }
}

function hoursCell(line: PayrollPreviewLine): string {
  return parsePayType(line.payType) === 'salaried' ? '—' : usd(line.hours)
}

function hoursTotalCell(hours: number): string {
  return hours ? usd(hours) : '—'
}

function previewDeduction(label: string, amount: number, ytd: number | undefined): PayrollPreviewDeduction | null {
  const current = parseMoney(amount)
  const year = ytdOrCurrent(ytd, current)
  if (current === 0 && year === 0) return null
  return { label, amount: current, ytd: year }
}

/** Summary plus the detail rows shown on the payroll review screen. */
export function buildPayrollPreviewLine(line: PayrollPreviewSourceLine): PayrollPreviewLine {
  const basicPay = parseMoney(line.basicPay)
  const otPay = parseMoney(line.otPay)
  const extraPay = parseMoney(line.extraPay)
  const grossPay = parseMoney(line.grossPay)
  const totalDeductions = parseMoney(line.totalDeductions)
  const netPay = parseMoney(line.netPay)
  const nis = parseMoney(line.nisEmployee)
  const optional = [
    previewDeduction('Loan', line.staffLoan, line.ytd?.staffLoan),
    previewDeduction('Medical', line.medical, line.ytd?.medical),
    previewDeduction('Shortage', line.shortageReady, line.ytd?.shortageReady),
    previewDeduction('Other', line.extraDeductionPay ?? 0, line.ytd?.extraDeductionPay)
  ].filter((row): row is PayrollPreviewDeduction => row !== null)

  return {
    staffName: line.staffName,
    payType: line.payType,
    taxCode: (line.taxCode ?? '').trim(),
    hours: round2(parseMoney(line.basicHours) + parseMoney(line.otHours)),
    grossPay,
    totalDeductions,
    netPay,
    basicHours: parseMoney(line.basicHours),
    basicPay,
    basicYtd: ytdOrCurrent(line.ytd?.basicPay, basicPay),
    otHours: parseMoney(line.otHours),
    otPay,
    otYtd: ytdOrCurrent(line.ytd?.otPay, otPay),
    extraPay,
    extraYtd: ytdOrCurrent(line.ytd?.extraPay, extraPay),
    grossYtd: ytdOrCurrent(line.ytd?.grossPay, grossPay),
    deductions: [{ label: 'NIS', amount: nis, ytd: ytdOrCurrent(line.ytd?.nisEmployee, nis) }, ...optional],
    deductionsYtd: ytdOrCurrent(line.ytd?.totalDeductions, totalDeductions),
    netYtd: ytdOrCurrent(line.ytd?.netPay, netPay),
    nisEmployer: parseMoney(line.nisEmployer),
    bankCode: (line.bankCode ?? '').trim(),
    accountNo: (line.accountNo ?? '').trim()
  }
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
  companyAddress?: string
  companyPhone?: string
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
    rate: hourly && line.otHours ? round2(line.otPay / line.otHours) : undefined,
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
  company: { companyName: string; address: string; phone: string }
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
        <div>${escapePayPeriodHtml(company.companyName)}</div>
        <div>${escapePayPeriodHtml(company.address)}</div>
        <div>${escapePayPeriodHtml(company.phone)}</div>
      </div>
      <div class="place">
        <div><span class="k">CENTRE:</span> CUL DE SAC</div>
        ${bank}
        <div><span class="k">PERIOD:</span> ${escapePayPeriodHtml(line.periodLabel)} ( ${escapePayPeriodHtml(periodRange)} )</div>
      </div>
    </div>
  </article>`
}

function payslipDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapePayPeriodHtml(title)}</title>
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

function printedLabel(now = new Date()): string {
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`
}

function cycleDayLabel(cycleNumber: number | undefined, endDate: string): string {
  if (cycleNumber && cycleNumber > 0) return String(cycleNumber)
  return payPeriodCycleNumber(endDate)
}

export function renderPayslipsHtml(input: PayslipPrintInput): string {
  const slips = input.lines.flatMap((line) => {
    const slip = buildPayslipLine(line)
    return slip ? [slip] : []
  })
  const payDate = mdy(input.payDate)
  const cycleDay = cycleDayLabel(input.cycleNumber, input.endDate)
  const period = `${mdy(input.startDate)} - ${mdy(input.endDate)}`
  const printed = printedLabel()
  const voided =
    input.status === 'void'
      ? `<p class="void">VOIDED${input.voidReason ? `: ${escapePayPeriodHtml(input.voidReason)}` : ''}. Record only.</p>`
      : ''
  const company = normalizePayslipCompany({
    companyName: input.companyName,
    address: input.companyAddress,
    phone: input.companyPhone
  })
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
        <footer>Printed: ${printed}<span>Page: ${pages.length + 1}</span></footer>
      </section>`
  const body =
    pages
      .map((page, index) => {
        const content =
          page.length > 0
            ? page.map((line) => slipHtml(line, payDate, cycleDay, period, company)).join('')
            : '<p class="empty">No payslips for this payroll.</p>'
        return `<section class="page">
        ${voided}
        ${content}
        <footer>Printed: ${printed}<span>Page: ${index + 1}</span></footer>
      </section>`
      })
      .join('') + totalsPage

  return payslipDocument(`Payslips ${period}`, body)
}

export type StaffPayslipSlip = {
  startDate: string
  endDate: string
  payDate: string
  cycleNumber?: number
  line: PayslipSourceLine
}

/** One slip per page, each with its own period. No pay-register totals page. */
export function renderStaffPayslipsHtml(input: {
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  slips: StaffPayslipSlip[]
}): string {
  const company = normalizePayslipCompany({
    companyName: input.companyName,
    address: input.companyAddress,
    phone: input.companyPhone
  })
  const printed = printedLabel()
  const pages = input.slips.flatMap((slip) => {
    const line = buildPayslipLine(slip.line)
    if (!line) return []
    const period = `${mdy(slip.startDate)} - ${mdy(slip.endDate)}`
    return [
      slipHtml(line, mdy(slip.payDate), cycleDayLabel(slip.cycleNumber, slip.endDate), period, company)
    ]
  })
  const body =
    pages.length > 0
      ? pages
          .map(
            (content, index) => `<section class="page">
        ${content}
        <footer>Printed: ${printed}<span>Page: ${index + 1}</span></footer>
      </section>`
          )
          .join('')
      : `<section class="page">
        <p class="empty">No payslips to print.</p>
        <footer>Printed: ${printed}<span>Page: 1</span></footer>
      </section>`
  const titleName = input.slips[0]?.line.staffName?.trim()
  return payslipDocument(titleName ? `Payslips ${titleName}` : 'Payslips', body)
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

export function printStaffPayslips(input: {
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  slips: StaffPayslipSlip[]
}): boolean {
  const printWin = window.open('', '_blank')
  if (!printWin) return false
  printWin.document.write(renderStaffPayslipsHtml(input))
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

function summaryMoneyRow(label: string, hours: string, totals: { gross: number; deductions: number; net: number }, kind: string) {
  return `<tr class="${kind}"><td>${escapePayPeriodHtml(label)}</td><td class="num">${hours}</td><td class="num">${formatMoney(totals.gross)}</td><td class="num">${formatMoney(totals.deductions)}</td><td class="num">${formatMoney(totals.net)}</td></tr>`
}

function summarySectionHtml(title: string, lines: PayrollPreviewLine[]): string {
  const totals = sectionTotals(lines)
  const body = lines
    .map(
      (line) => `<tr>
        <td>${escapePayPeriodHtml(line.staffName)}</td>
        <td class="num">${hoursCell(line)}</td>
        <td class="num">${formatMoney(line.grossPay)}</td>
        <td class="num">${formatMoney(line.totalDeductions)}</td>
        <td class="num">${formatMoney(line.netPay)}</td>
      </tr>`
    )
    .join('')
  return `<tr class="group"><td colspan="5">${escapePayPeriodHtml(title)}</td></tr>${body}${summaryMoneyRow('Subtotal', hoursTotalCell(totals.hours), totals, 'subtotal')}`
}

function detailArticleHtml(input: PayrollPreviewInput, line: PayrollPreviewLine): string {
  const payType = parsePayType(line.payType)
  const meta = line.taxCode
    ? `Pay type: ${payType} · Tax code ${escapePayPeriodHtml(line.taxCode)}`
    : `Pay type: ${payType}`
  const earning = (label: string, hours: string, amount: number, ytd: number, kind = '') =>
    `<tr class="${kind}"><td>${label}</td><td class="num">${hours}</td><td class="num">${formatMoney(amount)}</td><td class="num">${formatMoney(ytd)}</td></tr>`
  const deduction = (label: string, amount: number, ytd: number, kind = '') =>
    `<tr class="${kind}"><td>${escapePayPeriodHtml(label)}</td><td class="num">${formatMoney(amount)}</td><td class="num">${formatMoney(ytd)}</td></tr>`
  return `<article class="person">
    <header>
      <div>
        <h2>${escapePayPeriodHtml(line.staffName)}</h2>
        <p>${meta}</p>
      </div>
      <p>Pay date ${escapePayPeriodHtml(mdy(input.payDate))} · ${escapePayPeriodHtml(mdy(input.startDate))} – ${escapePayPeriodHtml(mdy(input.endDate))}</p>
    </header>
    <div class="cols">
      <div>
        <h3>Hours and earnings</h3>
        <table>
          <thead><tr><th></th><th>Hours</th><th>Amount</th><th>YTD</th></tr></thead>
          <tbody>
            ${earning('Basic', usd(line.basicHours), line.basicPay, line.basicYtd)}
            ${earning('Overtime', usd(line.otHours), line.otPay, line.otYtd)}
            ${earning('Extra', '', line.extraPay, line.extraYtd)}
            ${earning('Gross pay', '', line.grossPay, line.grossYtd, 'total')}
          </tbody>
        </table>
      </div>
      <div>
        <h3>Deductions</h3>
        <table>
          <thead><tr><th></th><th>Amount</th><th>YTD</th></tr></thead>
          <tbody>
            ${line.deductions.map((row) => deduction(row.label, row.amount, row.ytd)).join('')}
            ${deduction('Total deductions', line.totalDeductions, line.deductionsYtd, 'total')}
            ${deduction('Net pay', line.netPay, line.netYtd, 'net')}
          </tbody>
        </table>
      </div>
    </div>
    <p class="note">${escapePayPeriodHtml(previewEmployerNote(line))}</p>
  </article>`
}

/** Printable preview: summary on the first page, employee details on the pages after it. */
export function renderPayrollPreviewHtml(input: PayrollPreviewInput): string {
  const totals = sectionTotals(input.lines)
  const summaryRows = previewSections(input.lines)
    .map((section) => summarySectionHtml(section.title, section.lines))
    .join('')
  const details =
    input.lines.length > 0
      ? input.lines.map((line) => detailArticleHtml(input, line)).join('')
      : '<p class="empty">No employees in this payroll.</p>'
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Payroll preview ${escapePayPeriodHtml(mdy(input.startDate))} – ${escapePayPeriodHtml(mdy(input.endDate))}</title>
    <style>
      @page { size: letter; margin: 0.55in; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
      h1 { margin: 0; font-size: 20px; }
      .banner { margin: 8px 0 16px; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 4px 6px; text-align: left; border-bottom: 1px solid #e5e7eb; }
      th:not(:first-child), td.num { text-align: right; }
      th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
      .group td { padding-top: 12px; border-bottom: 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #92400e; }
      .subtotal td { font-weight: 700; background: #f5f3ff; }
      .grand td { font-weight: 700; background: #ede9fe; }
      .note { color: #64748b; font-size: 11px; }
      .person { page-break-inside: avoid; margin: 0 0 22px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
      .person header { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
      .person h2 { margin: 0; font-size: 14px; }
      .person header p, .person .note { margin: 2px 0 0; color: #64748b; font-size: 11px; }
      .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 8px; }
      .person h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
      .person .total td { font-weight: 700; }
      .person .net td { font-weight: 700; color: #065f46; }
      .empty { color: #64748b; }
    </style>
  </head>
  <body>
    <section class="page">
      <h1>Payroll summary</h1>
      <p class="banner">Pay period ${escapePayPeriodHtml(mdy(input.startDate))} – ${escapePayPeriodHtml(mdy(input.endDate))} · Pay date ${escapePayPeriodHtml(mdy(input.payDate))}. ${escapePayPeriodHtml(payrollPreviewStatus(input))}</p>
      <table>
        <thead><tr><th>Name</th><th>Total hours</th><th>Gross pay</th><th>Deductions</th><th>Net pay</th></tr></thead>
        <tbody>
          ${summaryRows}
          ${summaryMoneyRow('Total', usd(totals.hours), totals, 'grand')}
        </tbody>
      </table>
      <p class="note">PAYE is still calculated in Pay+.</p>
    </section>
    <section class="page">
      <h1>Payroll details</h1>
      <p class="banner">Pay period ${escapePayPeriodHtml(mdy(input.startDate))} – ${escapePayPeriodHtml(mdy(input.endDate))} · Pay date ${escapePayPeriodHtml(mdy(input.payDate))}</p>
      ${details}
    </section>
  </body>
</html>`
}

export function printPayrollPreview(input: PayrollPreviewInput): boolean {
  const printWin = window.open('', '_blank')
  if (!printWin) return false
  printWin.document.write(renderPayrollPreviewHtml(input))
  printWin.document.close()
  printWin.focus()
  printWin.print()
  return true
}

const PREVIEW_MARGIN = 40
const PREVIEW_BOTTOM = 40

type PreviewCell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> }

function previewPageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight()
}

function previewPageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth()
}

function previewEmployerNote(line: PayrollPreviewLine): string {
  let note = `Employer NIS ${formatMoney(line.nisEmployer)} is not taken from net.`
  if (line.bankCode) note += ` Bank ${line.bankCode}`
  if (line.accountNo) note += ` · ${line.accountNo}`
  return note
}

function summaryFillRow(
  label: string,
  hours: string,
  totals: { gross: number; deductions: number; net: number },
  fill: [number, number, number]
): PreviewCell[] {
  const styles = { fontStyle: 'bold', fillColor: fill }
  return [label, hours, formatMoney(totals.gross), formatMoney(totals.deductions), formatMoney(totals.net)].map(
    (content) => ({ content, styles })
  )
}

function summaryTableBody(lines: PayrollPreviewLine[]): PreviewCell[][] {
  const body: PreviewCell[][] = []
  for (const section of previewSections(lines)) {
    body.push([
      {
        content: section.title.toUpperCase(),
        colSpan: 5,
        styles: {
          font: 'helvetica',
          fontStyle: 'bold',
          textColor: [146, 64, 14],
          fontSize: 9,
          cellPadding: { top: 10, bottom: 3, left: 2, right: 2 }
        }
      }
    ])
    for (const line of section.lines) {
      body.push([
        line.staffName,
        hoursCell(line),
        formatMoney(line.grossPay),
        formatMoney(line.totalDeductions),
        formatMoney(line.netPay)
      ])
    }
    const totals = sectionTotals(section.lines)
    body.push(summaryFillRow('Subtotal', hoursTotalCell(totals.hours), totals, [245, 243, 255]))
  }
  const grand = sectionTotals(lines)
  body.push(summaryFillRow('Total', usd(grand.hours), grand, [237, 233, 254]))
  return body
}

function employeeBlockHeight(doc: jsPDF, line: PayrollPreviewLine): number {
  const rows = Math.max(4, line.deductions.length + 2)
  const noteLines = doc.splitTextToSize(previewEmployerNote(line), previewPageWidth(doc) - PREVIEW_MARGIN * 2).length
  return 77 + rows * 13 + noteLines * 10
}

function drawMoneyRow(
  doc: jsPDF,
  row: { label: string; hours?: string; amount: string; ytd: string; bold?: boolean; net?: boolean },
  labelX: number,
  hoursX: number | undefined,
  amountX: number,
  ytdX: number,
  y: number
) {
  doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
  doc.setFontSize(9)
  doc.setTextColor(row.net ? 6 : 17, row.net ? 95 : 24, row.net ? 70 : 39)
  doc.text(row.label, labelX, y)
  if (hoursX && row.hours) doc.text(row.hours, hoursX, y, { align: 'right' })
  doc.text(row.amount, amountX, y, { align: 'right' })
  doc.text(row.ytd, ytdX, y, { align: 'right' })
}

function drawEmployeeBlock(doc: jsPDF, input: PayrollPreviewInput, line: PayrollPreviewLine, y: number): number {
  const left = PREVIEW_MARGIN
  const right = previewPageWidth(doc) - PREVIEW_MARGIN
  const mid = left + (right - left) * 0.52
  const earnHours = left + 148
  const earnAmount = left + 214
  const earnYtd = mid - 18
  const dedAmount = right - 72
  const dedYtd = right

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(17, 24, 39)
  doc.text(line.staffName, left, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100)
  doc.text(`Pay date ${mdy(input.payDate)}  ·  ${mdy(input.startDate)} – ${mdy(input.endDate)}`, right, y, {
    align: 'right'
  })
  const payType = parsePayType(line.payType)
  doc.text(line.taxCode ? `Pay type: ${payType}   ·   Tax code ${line.taxCode}` : `Pay type: ${payType}`, left, y + 13)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('HOURS AND EARNINGS', left, y + 30)
  doc.text('DEDUCTIONS', mid, y + 30)
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text('HOURS', earnHours, y + 42, { align: 'right' })
  doc.text('AMOUNT', earnAmount, y + 42, { align: 'right' })
  doc.text('YTD', earnYtd, y + 42, { align: 'right' })
  doc.text('AMOUNT', dedAmount, y + 42, { align: 'right' })
  doc.text('YTD', dedYtd, y + 42, { align: 'right' })

  const earnings = [
    { label: 'Basic', hours: usd(line.basicHours), amount: formatMoney(line.basicPay), ytd: formatMoney(line.basicYtd) },
    { label: 'Overtime', hours: usd(line.otHours), amount: formatMoney(line.otPay), ytd: formatMoney(line.otYtd) },
    { label: 'Extra', hours: '', amount: formatMoney(line.extraPay), ytd: formatMoney(line.extraYtd) },
    { label: 'Gross pay', amount: formatMoney(line.grossPay), ytd: formatMoney(line.grossYtd), bold: true }
  ]
  const deductions = [
    ...line.deductions.map((row) => ({ label: row.label, amount: formatMoney(row.amount), ytd: formatMoney(row.ytd) })),
    {
      label: 'Total deductions',
      amount: formatMoney(line.totalDeductions),
      ytd: formatMoney(line.deductionsYtd),
      bold: true
    },
    { label: 'Net pay', amount: formatMoney(line.netPay), ytd: formatMoney(line.netYtd), bold: true, net: true }
  ]
  const count = Math.max(earnings.length, deductions.length)
  let rowY = y + 55
  for (let index = 0; index < count; index += 1) {
    const earn = earnings[index]
    const ded = deductions[index]
    if (earn) drawMoneyRow(doc, earn, left, earnHours, earnAmount, earnYtd, rowY)
    if (ded) drawMoneyRow(doc, ded, mid, undefined, dedAmount, dedYtd, rowY)
    rowY += 13
  }

  const note = doc.splitTextToSize(previewEmployerNote(line), right - left)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100)
  const noteY = rowY + 2
  doc.text(note, left, noteY)
  const ruleY = noteY + note.length * 10 + 4
  doc.setDrawColor(226, 232, 240)
  doc.line(left, ruleY, right, ruleY)
  return ruleY + 16
}

function drawDetailsHeading(doc: jsPDF, input: PayrollPreviewInput, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(17, 24, 39)
  doc.text('Payroll details', PREVIEW_MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(55)
  doc.text(
    `Pay period ${mdy(input.startDate)} – ${mdy(input.endDate)}  ·  Pay date ${mdy(input.payDate)}`,
    PREVIEW_MARGIN,
    y + 16
  )
  return y + 36
}

function drawPreviewDetails(doc: jsPDF, input: PayrollPreviewInput) {
  doc.addPage()
  let y = drawDetailsHeading(doc, input, 48)
  if (input.lines.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(55)
    doc.text('No employees in this payroll.', PREVIEW_MARGIN, y)
    return
  }
  for (const line of input.lines) {
    const height = employeeBlockHeight(doc, line)
    if (y + height > previewPageHeight(doc) - PREVIEW_BOTTOM) {
      doc.addPage()
      y = drawDetailsHeading(doc, input, 48)
    }
    y = drawEmployeeBlock(doc, input, line, y)
  }
}

function stampPreviewPages(doc: jsPDF) {
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`Page ${page} of ${total}`, previewPageWidth(doc) - PREVIEW_MARGIN, previewPageHeight(doc) - 22, {
      align: 'right'
    })
  }
}

/** Letter PDF. Page 1 is the summary. Later pages are the employee details. */
export function buildPayrollPreviewPdf(input: PayrollPreviewInput): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(17, 24, 39)
  doc.text('Payroll summary', PREVIEW_MARGIN, 48)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(55)
  doc.text(
    `Pay period ${mdy(input.startDate)} – ${mdy(input.endDate)}  ·  Pay date ${mdy(input.payDate)}`,
    PREVIEW_MARGIN,
    68
  )
  doc.text(payrollPreviewStatus(input), PREVIEW_MARGIN, 84)

  autoTable(doc, {
    startY: 100,
    head: [[
      'Name',
      { content: 'Total hours', styles: { halign: 'right' } },
      { content: 'Gross pay', styles: { halign: 'right' } },
      { content: 'Deductions', styles: { halign: 'right' } },
      { content: 'Net pay', styles: { halign: 'right' } }
    ]],
    body: summaryTableBody(input.lines),
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3, textColor: [17, 24, 39], overflow: 'linebreak' },
    headStyles: { fillColor: [91, 33, 182], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' }
    },
    margin: { left: PREVIEW_MARGIN, right: PREVIEW_MARGIN, bottom: 48 },
    showHead: 'everyPage'
  })

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100
  let noteY = finalY + 18
  if (noteY > previewPageHeight(doc) - PREVIEW_BOTTOM) {
    doc.addPage()
    noteY = 48
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text('PAYE is still calculated in Pay+.', PREVIEW_MARGIN, noteY)

  drawPreviewDetails(doc, input)
  stampPreviewPages(doc)
  return doc
}

export function downloadPayrollPreview(input: PayrollPreviewInput) {
  buildPayrollPreviewPdf(input).save(payrollPreviewFilename(input))
}
