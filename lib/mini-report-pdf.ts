import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMoney } from '@/lib/day-reconcile'
import type { MiniRangeReport } from '@/lib/mini-report'

const GREEN: [number, number, number] = [22, 163, 74]
const RED: [number, number, number] = [220, 38, 38]

export function miniReportFilename(report: MiniRangeReport): string {
  return report.from === report.to
    ? `mini-report-${report.from}.pdf`
    : `mini-report-${report.from}_to_${report.to}.pdf`
}

/** Saves the mini report (Collected and Deposit only) as a letter PDF. */
export function downloadMiniReportPdf(report: MiniRangeReport) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(17, 24, 39)
  doc.text(report.from === report.to ? report.from : `${report.from} to ${report.to}`, margin, 50)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text(`${report.dayCount} ${report.dayCount === 1 ? 'day' : 'days'}`, margin, 66)

  doc.setFontSize(8)
  doc.setTextColor(156, 163, 175)
  doc.text('Generated with ShiftClose', pageWidth - margin, 50, { align: 'right' })

  const dotted = (rows: { status: 'match' | 'differs' }[]) => ({
    didDrawCell: (data: { section: string; column: { index: number }; row: { index: number }; cell: { x: number; y: number; height: number } }) => {
      if (data.section !== 'body' || data.column.index !== 0) return
      const row = rows[data.row.index]
      if (!row) return
      const [r, g, b] = row.status === 'match' ? GREEN : RED
      doc.setFillColor(r, g, b)
      doc.circle(data.cell.x + 9, data.cell.y + data.cell.height / 2, 3, 'F')
    }
  })

  const head = { fillColor: [255, 255, 255] as [number, number, number], textColor: [107, 114, 128] as [number, number, number], fontStyle: 'normal' as const, fontSize: 8 }
  const baseStyles = { fontSize: 10, cellPadding: { top: 6, bottom: 6, left: 4, right: 4 }, textColor: [17, 24, 39] as [number, number, number], lineColor: [229, 231, 235] as [number, number, number], lineWidth: 0 }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(17, 24, 39)
  doc.text('Collected', margin, 100)

  autoTable(doc, {
    startY: 106,
    margin: { left: margin, right: margin },
    head: [['Type', 'System', 'Count']],
    body: report.collected.map((l) => [l.label, formatMoney(l.system), formatMoney(l.count)]),
    theme: 'plain',
    styles: baseStyles,
    headStyles: head,
    columnStyles: {
      0: { cellPadding: { top: 6, bottom: 6, left: 18, right: 4 } },
      1: { halign: 'right' },
      2: { halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        data.cell.styles.halign = data.column.index === 0 ? 'left' : 'right'
        if (data.column.index === 0) data.cell.styles.cellPadding = { top: 4, bottom: 4, left: 4, right: 4 }
      }
      if (data.section === 'body' && report.collected[data.row.index]?.key === 'cashChecks') {
        data.cell.styles.fontStyle = 'bold'
      }
    },
    didDrawCell: dotted(report.collected).didDrawCell
  })

  const afterCollected = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 260

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(17, 24, 39)
  doc.text('Deposit', margin, afterCollected + 30)

  autoTable(doc, {
    startY: afterCollected + 36,
    margin: { left: margin, right: margin },
    head: [['Type', 'Counted (Cash + Checks)', 'Deposited']],
    body: [['Deposit', formatMoney(report.deposit.counted), formatMoney(report.deposit.deposited)]],
    theme: 'plain',
    styles: { ...baseStyles, fontStyle: 'bold' },
    headStyles: head,
    columnStyles: {
      0: { cellPadding: { top: 6, bottom: 6, left: 18, right: 4 } },
      1: { halign: 'right' },
      2: { halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        data.cell.styles.halign = data.column.index === 0 ? 'left' : 'right'
        if (data.column.index === 0) data.cell.styles.cellPadding = { top: 4, bottom: 4, left: 4, right: 4 }
      }
    },
    didDrawCell: dotted([{ status: report.deposit.status }]).didDrawCell
  })

  doc.save(miniReportFilename(report))
}
