import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateDisplay } from './pay-period-excel'
import { formatMoney } from './pay-run'
import {
  creditUnionByCode,
  isCreditUnionBank,
  type BankingListingRow,
  type BankingPack
} from './pay-run-banking'

export type CreditUnionLetter = {
  code: string
  legalName: string
  street: string
  city: string
  settlementBank: string
  settlementAccount: string
  members: BankingListingRow[]
  total: number
}

const CU_ADDRESSEES: Record<
  string,
  { legalName: string; street: string; city: string; settlementBank: string; settlementAccount: string }
> = {
  NFGWCCU: {
    legalName: 'National Farmers & General Workers Co-operative Credit Union Society Ltd.',
    street: 'Bridge Street',
    city: 'Castries',
    settlementBank: 'Bank of Saint Lucia',
    settlementAccount: '412102733'
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function creditUnionLetters(pack: BankingPack): CreditUnionLetter[] {
  const groups = new Map<string, BankingListingRow[]>()
  for (const row of pack.listing) {
    if (!isCreditUnionBank(row.bankCode, row.bankName)) continue
    const code = row.bankCode.toUpperCase()
    const rows = groups.get(code) ?? []
    rows.push(row)
    groups.set(code, rows)
  }
  return [...groups.entries()]
    .map(([code, members]) => {
      const known = CU_ADDRESSEES[code]
      const registry = creditUnionByCode(code)
      const bankName = members.find((row) => row.bankName.trim())?.bankName.trim()
      return {
        code,
        legalName: known?.legalName ?? bankName ?? registry?.name ?? code,
        street: known?.street ?? '',
        city: known?.city ?? '',
        settlementBank: known?.settlementBank ?? '',
        settlementAccount: known?.settlementAccount ?? '',
        members,
        total: round2(members.reduce((s, row) => s + row.netPay, 0))
      }
    })
    .sort((a, b) => a.code.localeCompare(b.code))
}

export function cuLetterSubject(letter: CreditUnionLetter, payDate: string): string {
  return `Salary allocation — ${letter.code} — ${formatDateDisplay(payDate)}`
}

export function cuLetterEmailBody(letter: CreditUnionLetter): string {
  if (letter.settlementBank && letter.settlementAccount) {
    return `Please see attached breakdown of the credit to ${letter.settlementBank} ${letter.settlementAccount}.`
  }
  return `Please see attached salary allocation for ${letter.legalName}.`
}

export function cuLetterEmailHtml(message: string): string {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  return `<p>${escaped}</p>`
}

/** Default letter prose. Known credit unions start from their address; others start blank for the editor. */
export function defaultCreditUnionLetterText(letter: CreditUnionLetter, payDate: string): string {
  const settlement =
    letter.settlementBank && letter.settlementAccount
      ? `${letter.settlementBank} account ${letter.settlementAccount}`
      : 'your institution'
  const lines = [formatDateDisplay(payDate), '', 'The Manager', letter.legalName]
  if (letter.street) lines.push(letter.street)
  if (letter.city) lines.push(letter.city)
  lines.push('', `Please find below the amounts credited to ${settlement} in respect of salaries.`)
  return lines.join('\n')
}

export function cuLetterFilename(letter: CreditUnionLetter, payDate: string): string {
  return `salary-allocation-${letter.code}-${payDate}.pdf`
}

function writeLetterProse(doc: jsPDF, text: string, margin: number, startY: number): number {
  let y = startY
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  for (const line of text.split('\n')) {
    if (y > 10) {
      doc.addPage()
      y = margin
    }
    if (!line.trim()) {
      y += 0.16
      continue
    }
    const wrapped = doc.splitTextToSize(line, 7) as string[]
    doc.text(wrapped, margin, y)
    y += wrapped.length * 0.2
  }
  return y + 0.15
}

export function buildCreditUnionLetterPdf(
  letter: CreditUnionLetter,
  payDate: string,
  letterText?: string
): jsPDF {
  const doc = new jsPDF('portrait', 'in', 'letter')
  const margin = 0.75
  let y = margin

  doc.setFont('times', 'bold')
  doc.setFontSize(14)
  doc.text('TOTAL AUTO INC.', 4.25, y, { align: 'center' })
  y += 0.22
  doc.setFont('times', 'normal')
  doc.setFontSize(10)
  doc.text('Cul de Sac · John Compton Highway', 4.25, y, { align: 'center' })
  y += 0.18
  doc.text('P.O. Box GM 674, Castries, Saint Lucia', 4.25, y, { align: 'center' })
  y += 0.4

  const prose = letterText?.trim() || defaultCreditUnionLetterText(letter, payDate)
  y = writeLetterProse(doc, prose, margin, y)

  autoTable(doc, {
    startY: y,
    head: [['Name', 'A/C #', 'Amount']],
    body: [
      ...letter.members.map((row) => [row.staffName, row.accountNo || '—', formatMoney(row.netPay)]),
      ['Total', '', formatMoney(letter.total)]
    ],
    theme: 'plain',
    styles: { font: 'times', fontSize: 11, cellPadding: 0.06 },
    headStyles: { fontStyle: 'bold', lineWidth: { bottom: 0.01 } },
    columnStyles: {
      0: { cellWidth: 3.4 },
      1: { cellWidth: 2.2 },
      2: { cellWidth: 1.4, halign: 'right' }
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.row.index === letter.members.length) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.lineWidth = { top: 0.01 }
      }
    }
  })

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 0.45
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.text('Yours truly,', margin, y)
  y += 0.55
  doc.setFont('times', 'bold')
  doc.text('Elrus Elcock', margin, y)
  y += 0.18
  doc.setFont('times', 'italic')
  doc.text('Managing Director', margin, y)
  return doc
}

export function creditUnionLetterPdfBuffer(
  letter: CreditUnionLetter,
  payDate: string,
  letterText?: string
): Buffer {
  const bytes = buildCreditUnionLetterPdf(letter, payDate, letterText).output('arraybuffer')
  return Buffer.from(bytes)
}
