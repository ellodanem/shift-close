import jsPDF from 'jspdf'
import { formatAmount } from '@/lib/fuelPayments'
import { formatCstoreDisplayDate } from '@/lib/parse-customer-credit-report'
import {
  fetchAccountStatement,
  formatStatementDateRange,
  type AccountStatement,
  type StatementMode
} from '@/lib/customer-statement'

function addPageIfNeeded(doc: jsPDF, yPos: number, margin: number): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (yPos > pageHeight - 0.75) {
    doc.addPage()
    return margin
  }
  return yPos
}

function renderSummaryPdf(doc: jsPDF, statement: AccountStatement, margin: number): void {
  if (statement.mode !== 'summary') return
  let yPos = margin + 0.6

  doc.setFont('courier', 'bold')
  doc.setFontSize(10)
  doc.text('Month', margin, yPos)
  doc.text('Opening', margin + 1.8, yPos)
  doc.text('Charges', margin + 3.2, yPos)
  doc.text('Payments', margin + 4.6, yPos)
  doc.text('Closing', margin + 6.0, yPos)
  yPos += 0.25
  doc.setFont('courier', 'normal')

  for (const row of statement.rows) {
    yPos = addPageIfNeeded(doc, yPos, margin)
    doc.text(row.monthLabel.slice(0, 18), margin, yPos)
    doc.text(formatAmount(row.opening), margin + 1.8, yPos)
    doc.text(formatAmount(row.charges), margin + 3.2, yPos)
    doc.text(formatAmount(row.payments), margin + 4.6, yPos)
    doc.text(formatAmount(row.closing), margin + 6.0, yPos)
    yPos += 0.22
  }

  yPos += 0.15
  doc.setDrawColor(0, 0, 0)
  doc.line(margin, yPos, 8.5 - margin, yPos)
  yPos += 0.25
  doc.setFont('courier', 'bold')
  doc.text('Period totals', margin, yPos)
  doc.text(formatAmount(statement.totals.opening), margin + 1.8, yPos)
  doc.text(formatAmount(statement.totals.charges), margin + 3.2, yPos)
  doc.text(formatAmount(statement.totals.payments), margin + 4.6, yPos)
  doc.text(formatAmount(statement.totals.closing), margin + 6.0, yPos)
}

function renderDetailPdf(doc: jsPDF, statement: AccountStatement, margin: number): void {
  if (statement.mode !== 'detail') return
  let yPos = margin + 0.55

  doc.setFont('courier', 'normal')
  doc.setFontSize(10)
  doc.text(`Opening balance: ${formatAmount(statement.opening)}`, margin, yPos)
  yPos += 0.35

  doc.setFont('courier', 'bold')
  doc.text('Date', margin, yPos)
  doc.text('Charges', margin + 1.5, yPos)
  doc.text('Payments', margin + 2.8, yPos)
  doc.text('Balance', margin + 4.1, yPos)
  doc.text('Memo', margin + 5.4, yPos)
  yPos += 0.25
  doc.setFont('courier', 'normal')

  for (const row of statement.rows) {
    yPos = addPageIfNeeded(doc, yPos, margin)
    doc.text(formatCstoreDisplayDate(row.date), margin, yPos)
    doc.text(row.charges > 0 ? formatAmount(row.charges) : '—', margin + 1.5, yPos)
    doc.text(row.payments > 0 ? formatAmount(row.payments) : '—', margin + 2.8, yPos)
    doc.text(formatAmount(row.runningTotal), margin + 4.1, yPos)
    const memo = (row.memo || '').slice(0, 28)
    doc.text(memo || '—', margin + 5.4, yPos)
    yPos += 0.22
  }

  yPos += 0.15
  doc.setDrawColor(0, 0, 0)
  doc.line(margin, yPos, 8.5 - margin, yPos)
  yPos += 0.25
  doc.setFont('courier', 'bold')
  doc.text('Totals', margin, yPos)
  doc.text(formatAmount(statement.totals.charges), margin + 1.5, yPos)
  doc.text(formatAmount(statement.totals.payments), margin + 2.8, yPos)
  doc.text(formatAmount(statement.totals.closing), margin + 4.1, yPos)
}

export async function generateCustomerStatementPdfBuffer(params: {
  account: string
  startDate: string
  endDate: string
  mode: StatementMode
}): Promise<{ buffer: Buffer; filename: string }> {
  const statement = await fetchAccountStatement(
    params.account,
    params.startDate,
    params.endDate,
    params.mode
  )

  const doc = new jsPDF('portrait', 'in', 'letter')
  const margin = 0.5
  let yPos = margin

  doc.setFont('courier', 'bold')
  doc.setFontSize(16)
  doc.text('Account Statement', margin, yPos)
  yPos += 0.35

  doc.setFontSize(12)
  doc.text(statement.account, margin, yPos)
  yPos += 0.25
  doc.setFont('courier', 'normal')
  doc.text(formatStatementDateRange(statement.startDate, statement.endDate), margin, yPos)
  yPos += 0.2
  doc.text(
    params.mode === 'summary' ? 'Summary (monthly roll-forward)' : 'Detail (all transactions)',
    margin,
    yPos
  )

  if (params.mode === 'summary') {
    renderSummaryPdf(doc, statement, margin)
  } else {
    renderDetailPdf(doc, statement, margin)
  }

  const safeAccount = statement.account.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 40)
  const filename = `statement-${safeAccount}-${params.startDate}-to-${params.endDate}.pdf`

  return {
    buffer: Buffer.from(doc.output('arraybuffer')),
    filename
  }
}

export function buildWhatsAppStatementMessage(statement: AccountStatement): string {
  const range = formatStatementDateRange(statement.startDate, statement.endDate)
  const header = `Customer account statement — ${statement.account}\n${range}`

  if (statement.mode === 'summary') {
    const lines = statement.rows.map(
      (r) =>
        `${r.monthLabel}: charges ${formatAmount(r.charges)}, payments ${formatAmount(r.payments)}, closing ${formatAmount(r.closing)}`
    )
    const footer = `\nPeriod closing: ${formatAmount(statement.totals.closing)}`
    return `${header}\n\n${lines.join('\n')}${footer}\n\n— Westline Shift Close`
  }

  const footer = `Opening ${formatAmount(statement.opening)} → Closing ${formatAmount(statement.totals.closing)} (${statement.rows.length} lines)`
  return `${header}\n\n${footer}\n\n— Westline Shift Close`
}
