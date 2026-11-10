import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMoney } from '@/lib/day-reconcile'
import { formatDmy, type MiniRangeReport } from '@/lib/mini-report'

const GREEN: [number, number, number] = [22, 163, 74]
const RED: [number, number, number] = [220, 38, 38]
const INK: [number, number, number] = [17, 24, 39]
const GREY: [number, number, number] = [107, 114, 128]

export function miniReportFilename(report: MiniRangeReport): string {
  return report.from === report.to
    ? `mini-report-${report.from}.pdf`
    : `mini-report-${report.from}_to_${report.to}.pdf`
}

/** Saves the mini report (card / electronic, fleet, vouchers and the deposit) as a letter PDF. */
export function downloadMiniReportPdf(report: MiniRangeReport) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...INK)
  doc.text(
    report.from === report.to ? formatDmy(report.from) : `${formatDmy(report.from)} to ${formatDmy(report.to)}`,
    margin,
    50
  )

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GREY)
  doc.text(`${report.dayCount} ${report.dayCount === 1 ? 'day' : 'days'}`, margin, 66)

  doc.setFontSize(8)
  doc.setTextColor(156, 163, 175)
  doc.text('Generated with ShiftClose', pageWidth - margin, 50, { align: 'right' })

  const styles = {
    fontSize: 10,
    cellPadding: { top: 6, bottom: 6, left: 4, right: 4 },
    textColor: INK,
    lineWidth: 0
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text('Collected', margin, 100)

  const rows: { label: string; amount: number; kind: 'total' | 'sub' | 'plain' }[] = [
    { label: 'Total', amount: report.card.total, kind: 'total' },
    { label: 'Debit (system)', amount: report.card.debit, kind: 'sub' },
    { label: 'Credit (other)', amount: report.card.credit, kind: 'sub' },
    { label: 'In-House', amount: report.inhouse, kind: 'plain' },
    { label: 'Fleet', amount: report.fleet, kind: 'plain' },
    { label: 'Vouchers / coupons', amount: report.vouchers, kind: 'plain' }
  ]

  autoTable(doc, {
    startY: 106,
    margin: { left: margin, right: margin },
    head: [[{ content: 'CARD / ELECTRONIC', colSpan: 2, styles: { halign: 'left' } }]],
    body: rows.map((r) => [r.label, formatMoney(r.amount)]),
    theme: 'plain',
    styles,
    headStyles: { textColor: GREY, fontStyle: 'normal', fontSize: 8, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const row = rows[data.row.index]
      if (row.kind === 'total') data.cell.styles.fontStyle = 'bold'
      if (row.kind === 'sub') {
        data.cell.styles.fontSize = 9
        data.cell.styles.textColor = GREY
        if (data.column.index === 0) data.cell.styles.cellPadding = { top: 4, bottom: 4, left: 18, right: 4 }
      }
    }
  })

  const afterCollected = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 260

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text('Deposit', margin, afterCollected + 30)

  autoTable(doc, {
    startY: afterCollected + 36,
    margin: { left: margin, right: margin },
    head: [['Type', 'Counted (Cash + Checks)', 'Deposited']],
    body: [['Deposit', formatMoney(report.deposit.counted), formatMoney(report.deposit.deposited)]],
    theme: 'plain',
    styles: { ...styles, fontStyle: 'bold' },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: GREY,
      fontStyle: 'normal',
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 }
    },
    columnStyles: {
      0: { cellPadding: { top: 6, bottom: 6, left: 18, right: 4 } },
      1: { halign: 'right' },
      2: { halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right'
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return
      const [r, g, b] = report.deposit.status === 'match' ? GREEN : RED
      doc.setFillColor(r, g, b)
      doc.circle(data.cell.x + 9, data.cell.y + data.cell.height / 2, 3, 'F')
    }
  })

  doc.save(miniReportFilename(report))
}
