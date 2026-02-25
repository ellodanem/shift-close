import { prisma } from '@/lib/prisma'
import { groupBatchesForMonth, formatAmount, padInvoiceNumber } from '@/lib/fuelPayments'
import jsPDF from 'jspdf'

export async function generateMonthlyReportPdfBuffer(month: string): Promise<Buffer> {
  const [year, monthNum] = month.split('-').map(Number)
  const startDate = new Date(year, monthNum - 1, 1)
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999)

  const batches = await prisma.paymentBatch.findMany({
    where: {
      paymentDate: { gte: startDate, lte: endDate }
    },
    include: {
      invoices: { orderBy: { invoiceNumber: 'asc' } }
    },
    orderBy: [{ paymentDate: 'asc' }, { bankRef: 'asc' }]
  })

  const report = groupBatchesForMonth(batches, month)

  const doc = new jsPDF('portrait', 'in', 'letter')
  const margin = 0.5
  const pageHeight = doc.internal.pageSize.getHeight()
  let yPos = margin

  doc.setFont('courier', 'normal')
  doc.setFontSize(14)

  doc.setFont('courier', 'bold')
  doc.setFontSize(16)
  doc.text(`Monthly Fuel Payment Report – ${report.monthName}`, margin, yPos)
  yPos += 0.5

  const col1Start = margin
  const col2End = margin + 2.2

  if (report.byDate.length === 0) {
    doc.setFont('courier', 'normal')
    doc.text(`No payments found for ${report.monthName}`, margin, yPos)
  } else {
    doc.setFont('courier', 'normal')
    doc.setFontSize(12)

    for (const dateGroup of report.byDate) {
      doc.setFont('courier', 'bold')
      doc.text(dateGroup.dateFormatted, margin, yPos)
      yPos += 0.25

      for (const block of dateGroup.blocks) {
        for (const inv of block.invoices) {
          doc.setFont('courier', 'normal')
          doc.text(padInvoiceNumber(inv.invoiceNumber), col1Start, yPos)
          const amt = formatAmount(inv.amount)
          doc.text(amt, col2End - doc.getTextWidth(amt), yPos)
          doc.text(inv.type, margin + 2.5, yPos)
          yPos += 0.2
        }
        doc.text('------------------------', margin, yPos)
        yPos += 0.2
        doc.setFont('courier', 'bold')
        const subAmt = formatAmount(block.subtotal)
        doc.text(subAmt, col2End - doc.getTextWidth(subAmt), yPos)
        yPos += 0.2
        doc.setFont('courier', 'normal')
        doc.text(`Ref ${block.bankRef}`, margin, yPos)
        yPos += 0.5

        if (yPos > pageHeight - 1) {
          doc.addPage()
          yPos = margin
        }
      }
      yPos += 0.3
    }

    yPos += 0.2
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.02)
    doc.line(margin, yPos, 8.5 - margin, yPos)
    yPos += 0.3
    doc.setFont('courier', 'bold')
    doc.setFontSize(14)
    doc.text(`TOTAL PAID (${report.monthName}): ${formatAmount(report.grandTotal)}`, margin, yPos)
  }

  return Buffer.from(doc.output('arraybuffer'))
}
