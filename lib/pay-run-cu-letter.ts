import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateDisplay } from './pay-period-excel'
import { formatMoney } from './pay-run'
import { isCreditUnionBank, type BankingListingRow, type BankingPack } from './pay-run-banking'

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
    if (!isCreditUnionBank(row.bankCode)) continue
    const code = row.bankCode.toUpperCase()
    const rows = groups.get(code) ?? []
    rows.push(row)
    groups.set(code, rows)
  }
  return [...groups.entries()]
    .map(([code, members]) => {
      const known = CU_ADDRESSEES[code]
      return {
        code,
        legalName: known?.legalName ?? code,
        street: known?.street ?? '',
        city: known?.city ?? 'Castries',
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

export function cuLetterFilename(letter: CreditUnionLetter, payDate: string): string {
  return `salary-allocation-${letter.code}-${payDate}.pdf`
}

export function buildCreditUnionLetterPdf(letter: CreditUnionLetter, payDate: string): jsPDF {
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

  doc.text(formatDateDisplay(payDate), margin, y)
  y += 0.35
  doc.text('The Manager', margin, y)
  y += 0.18
  doc.text(letter.legalName, margin, y)
  y += 0.18
  if (letter.street) {
    doc.text(letter.street, margin, y)
    y += 0.18
  }
  doc.text(letter.city, margin, y)
  y += 0.35

  const settlement =
    letter.settlementBank && letter.settlementAccount
      ? `${letter.settlementBank} account ${letter.settlementAccount}`
      : 'your institution'
  doc.text(
    `Please find below the amounts credited to ${settlement} in respect of salaries.`,
    margin,
    y,
    { maxWidth: 7 }
  )
  y += 0.4

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
  doc.text('Yours truly,', margin, y)
  y += 0.55
  doc.setFont('times', 'bold')
  doc.text('Elrus Elcock', margin, y)
  y += 0.18
  doc.setFont('times', 'italic')
  doc.text('Managing Director', margin, y)
  return doc
}

export function downloadCreditUnionLetter(letter: CreditUnionLetter, payDate: string) {
  buildCreditUnionLetterPdf(letter, payDate).save(cuLetterFilename(letter, payDate))
}

export function creditUnionLetterPdfBuffer(letter: CreditUnionLetter, payDate: string): Buffer {
  const bytes = buildCreditUnionLetterPdf(letter, payDate).output('arraybuffer')
  return Buffer.from(bytes)
}
