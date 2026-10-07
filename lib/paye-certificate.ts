import { escapePayPeriodHtml } from '@/lib/pay-period-email'
import {
  parseMoney,
  visibleExtraLines,
  type PayRunExtraLine
} from '@/lib/pay-run'

export type PayeCertificateForm = 'TD5' | 'TD4'

export type PayeCertificateAmount = {
  label: string
  amount: number
}

export type PayeCertificateSourceLine = {
  payDate: string
  staffId: string | null
  staffName: string
  staffNo: string | null
  taxCode: string
  basicPay: number
  otPay: number
  vacationPay: number
  extraPay: number
  extraLines: PayRunExtraLine[]
  extraDeductions: PayRunExtraLine[]
  nisEmployee: number
  paye: number
}

export type PayeCertificateStaff = {
  id: string
  name: string
  address: string
  startDate: string | null
  status: string
  nicNumber: string | null
  taxCode: string
  taxNumber: string
}

export type PayeCertificate = {
  form: PayeCertificateForm
  name: string
  address: string
  employed: string
  incomeYear: number
  taxCode: string
  taxNumber: string
  nisNumber: string
  earnings: PayeCertificateAmount[]
  deductions: PayeCertificateAmount[]
  earningsTotal: number
  deductionsTotal: number
  allowances: number
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function labelKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isAllowance(label: string): boolean {
  return label.toLowerCase().includes('allowance')
}

function isTypedPaye(label: string): boolean {
  const key = labelKey(label)
  return key === 'paye' || key === 'payetax'
}

/** TD5 while the person is still employed. TD4 once they are marked inactive. */
export function payeCertificateForm(status: string | null | undefined): PayeCertificateForm {
  return status === 'inactive' ? 'TD4' : 'TD5'
}

export function incomeYearRange(year: number): { startDate: string; endDate: string } {
  const y = String(year)
  return { startDate: `${y}-01-01`, endDate: `${y}-12-31` }
}

/** A certificate covers one calendar income year. A shorter range inside that year is allowed. */
export function incomeYearOf(startDate: string, endDate: string): number | null {
  if (!YMD.test(startDate) || !YMD.test(endDate) || startDate > endDate) return null
  const start = Number(startDate.slice(0, 4))
  const end = Number(endDate.slice(0, 4))
  if (start !== end || start < 1900) return null
  return start
}

export function filingDeadlineLabel(incomeYear: number): string {
  return `March 31, ${incomeYear + 1}`
}

function money(n: number): string {
  return round2(n).toFixed(2)
}

function mdy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ''
  return `${m}/${d}/${y}`
}

type Bucket = {
  staffId: string | null
  staffName: string
  staffNo: string
  taxCode: string
  basic: number
  ot: number
  vacation: number
  extras: Map<string, number>
  allowances: number
  nis: number
  paye: number
}

function addExtra(bucket: Bucket, label: string, amount: number) {
  const n = round2(amount)
  if (!n) return
  if (isAllowance(label)) {
    bucket.allowances = round2(bucket.allowances + n)
    return
  }
  const name = label.trim() || 'Extra'
  bucket.extras.set(name, round2((bucket.extras.get(name) ?? 0) + n))
}

export function buildPayeCertificates(
  incomeYear: number,
  lines: PayeCertificateSourceLine[],
  staff: PayeCertificateStaff[]
): PayeCertificate[] {
  const people = new Map(staff.map((person) => [person.id, person]))
  const buckets = new Map<string, Bucket>()
  const ordered = [...lines].sort((a, b) => a.payDate.localeCompare(b.payDate) || a.staffName.localeCompare(b.staffName))

  for (const line of ordered) {
    const staffId = line.staffId?.trim() || null
    const key = staffId || `name:${line.staffName.trim().toLowerCase()}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        staffId,
        staffName: line.staffName.trim() || 'Staff',
        staffNo: '',
        taxCode: '',
        basic: 0,
        ot: 0,
        vacation: 0,
        extras: new Map(),
        allowances: 0,
        nis: 0,
        paye: 0
      }
      buckets.set(key, bucket)
    }
    if (line.staffName.trim()) bucket.staffName = line.staffName.trim()
    const nic = (line.staffNo ?? '').trim()
    if (nic) bucket.staffNo = nic
    const code = line.taxCode.trim()
    if (code) bucket.taxCode = code
    bucket.basic = round2(bucket.basic + parseMoney(line.basicPay))
    bucket.ot = round2(bucket.ot + parseMoney(line.otPay))
    bucket.vacation = round2(bucket.vacation + parseMoney(line.vacationPay))
    bucket.nis = round2(bucket.nis + parseMoney(line.nisEmployee))

    const calculatedPaye = parseMoney(line.paye)
    if (calculatedPaye > 0) {
      bucket.paye = round2(bucket.paye + calculatedPaye)
    } else {
      for (const extra of line.extraDeductions) {
        if (isTypedPaye(extra.label)) bucket.paye = round2(bucket.paye + parseMoney(extra.amount))
      }
    }

    const extras = visibleExtraLines(line.extraLines)
    let listed = 0
    for (const extra of extras) {
      addExtra(bucket, extra.label, extra.amount)
      listed = round2(listed + parseMoney(extra.amount))
    }
    const remainder = round2(parseMoney(line.extraPay) - listed)
    if (remainder > 0) addExtra(bucket, 'Extra', remainder)
  }

  const certificates: PayeCertificate[] = []
  for (const bucket of buckets.values()) {
    const person = bucket.staffId ? people.get(bucket.staffId) : undefined
    const earnings: PayeCertificateAmount[] = []
    if (bucket.basic) earnings.push({ label: 'Basic', amount: bucket.basic })
    if (bucket.ot) earnings.push({ label: 'O/T(one&half)', amount: bucket.ot })
    if (bucket.vacation) earnings.push({ label: 'Vacation', amount: bucket.vacation })
    for (const [label, amount] of [...bucket.extras.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (amount) earnings.push({ label, amount })
    }
    const deductions: PayeCertificateAmount[] = [{ label: 'N.I.S.', amount: bucket.nis }]
    if (bucket.paye) deductions.push({ label: 'P.A.Y.E.', amount: bucket.paye })
    const earningsTotal = round2(earnings.reduce((sum, row) => sum + row.amount, 0))
    const deductionsTotal = round2(deductions.reduce((sum, row) => sum + row.amount, 0))
    const allowances = round2(bucket.allowances)
    if (earningsTotal === 0 && deductionsTotal === 0 && allowances === 0) continue

    certificates.push({
      form: payeCertificateForm(person?.status),
      name: person?.name.trim() || bucket.staffName,
      address: (person?.address ?? '').trim(),
      employed: person?.startDate && YMD.test(person.startDate) ? person.startDate : '',
      incomeYear,
      taxCode: bucket.taxCode || (person?.taxCode ?? '').trim(),
      taxNumber: (person?.taxNumber ?? '').trim(),
      nisNumber: (person?.nicNumber ?? '').trim() || bucket.staffNo,
      earnings,
      deductions,
      earningsTotal,
      deductionsTotal,
      allowances
    })
  }

  return certificates.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function certificateBlock(cert: PayeCertificate): string {
  const rows = Math.max(cert.earnings.length, cert.deductions.length, 1)
  const body = Array.from({ length: rows }, (_, index) => {
    const earning = cert.earnings[index]
    const deduction = cert.deductions[index]
    return `<tr>
      <td>${earning ? escapePayPeriodHtml(earning.label) : ''}</td>
      <td class="num">${earning ? money(earning.amount) : ''}</td>
      <td>${deduction ? escapePayPeriodHtml(deduction.label) : ''}</td>
      <td class="num">${deduction ? money(deduction.amount) : ''}</td>
    </tr>`
  }).join('')
  const allowance =
    cert.allowances !== 0 ? `<span class="num">${money(cert.allowances)}</span>` : ''

  return `<article class="cert">
    <p class="form">${cert.form}</p>
    <div class="id">
      <span><b>NAME:</b> ${escapePayPeriodHtml(cert.name)}</span>
      <span><b>EMPLOYED:</b> ${escapePayPeriodHtml(mdy(cert.employed))}</span>
      <span><b>INCOME YR:</b> ${cert.incomeYear}</span>
      <span><b>TAXCODE:</b> ${escapePayPeriodHtml(cert.taxCode)}</span>
      <span><b>TAX #:</b> ${escapePayPeriodHtml(cert.taxNumber)}</span>
      <span><b>NIS #:</b> ${escapePayPeriodHtml(cert.nisNumber)}</span>
    </div>
    <p class="addr"><b>ADDRESS:</b> ${escapePayPeriodHtml(cert.address)}</p>
    <table>
      <thead>
        <tr>
          <th>EARNINGS</th>
          <th class="num">AMOUNT</th>
          <th>DEDUCTIONS</th>
          <th class="num">AMOUNT</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr>
          <td>TOTALS</td>
          <td class="num">${money(cert.earningsTotal)}</td>
          <td></td>
          <td class="num">${money(cert.deductionsTotal)}</td>
        </tr>
      </tfoot>
    </table>
    <p class="allow"><b>TOTAL ALLOWANCES</b> ${allowance}</p>
    <p class="file">ATTACH THIS COPY TO YOUR RETURN AND FILE ON OR BEFORE ${escapePayPeriodHtml(
      filingDeadlineLabel(cert.incomeYear).toUpperCase()
    )}</p>
  </article>`
}

export function renderPayeCertificateHtml(input: {
  startDate: string
  endDate: string
  incomeYear: number
  certificates: PayeCertificate[]
}): string {
  const blocks = input.certificates.map(certificateBlock).join('')
  const title = `TD5 TD4 ${input.incomeYear}`
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapePayPeriodHtml(title)}</title>
    <style>
      @page { size: letter; margin: 0.55in; }
      body { font-family: "Times New Roman", Times, serif; color: #111; margin: 28px; font-size: 13px; }
      .cert { page-break-inside: avoid; border-bottom: 1px solid #111; margin: 0 0 22px; padding: 0 0 12px; }
      .form { margin: 0 0 6px; text-align: right; font-weight: 700; letter-spacing: 0.08em; }
      .id { display: flex; flex-wrap: wrap; gap: 6px 18px; }
      .addr { margin: 4px 0 14px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-weight: 700; padding: 2px 8px 8px 0; }
      td { padding: 1px 8px 1px 0; vertical-align: top; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      th.num { text-align: right; }
      tfoot td { border-top: 1px solid #111; font-weight: 700; padding-top: 4px; }
      .allow { margin: 8px 0 0; }
      .allow .num { float: right; font-weight: 400; }
      .file { margin: 16px 0 4px; text-align: center; font-style: italic; font-size: 12px; letter-spacing: 0.01em; }
    </style>
  </head>
  <body>
    ${blocks || '<p>No approved pay in this range.</p>'}
  </body>
</html>`
}

export function payeCertificateFilename(startDate: string, endDate: string): string {
  const year = incomeYearOf(startDate, endDate)
  const full = year != null && startDate === `${year}-01-01` && endDate === `${year}-12-31`
  return full ? `td5-td4-${year}.pdf` : `td5-td4-${startDate}-${endDate}.pdf`
}
