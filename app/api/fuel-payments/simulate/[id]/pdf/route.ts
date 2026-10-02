import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { proposedPaymentBalances } from '@/lib/fuelBalance'
import { roundMoney, formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Helper to calculate days past due
function calculateDaysPastDue(dueDate: Date | string): number {
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diffTime = now.getTime() - due.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

// GET PDF for simulation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Fetch simulation
    const simulation = await prisma.paymentSimulation.findUnique({
      where: { id }
    })

    if (!simulation) {
      return NextResponse.json(
        { error: 'Simulation not found' },
        { status: 404 }
      )
    }

    // Parse invoice IDs and fetch invoices
    const invoiceIds = JSON.parse(simulation.selectedInvoiceIds)
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds }
      },
      orderBy: {
        invoiceNumber: 'asc'
      }
    })

    // Calculate total
    const totalAmount = roundMoney(
      invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    // Fetch balance information
    const balanceRecord = await prisma.balance.findUnique({
      where: { id: 'balance' }
    })

    // Calculate planned amount from this simulation
    const planned = roundMoney(
      invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    const proposedBalances = balanceRecord
      ? proposedPaymentBalances(
          balanceRecord.availableFunds,
          balanceRecord.totalAutoAvailable ?? 0,
          planned
        )
      : null

    // Optional image/PDF omissions. These stay unpaid; they are only left off this draft.
    const omitIds = (request.nextUrl.searchParams.get('omit') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && !invoiceIds.includes(id))

    // Fetch other unpaid invoices (excluding the ones in simulation, plus any omitted from this draft)
    const otherUnpaidInvoices = await prisma.invoice.findMany({
      where: {
        status: 'pending',
        id: { notIn: [...invoiceIds, ...omitIds] }
      },
      orderBy: {
        invoiceNumber: 'asc'
      }
    })

    // Generate PDF with plain text format
    const doc = new jsPDF('portrait', 'in', 'letter')
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 0.5
    let yPos = margin

    // Use monospace font for plain text look
    doc.setFont('courier', 'normal')
    doc.setFontSize(14)

    // Proposed Payment Section
    doc.setFont('courier', 'bold')
    doc.setFontSize(16)
    doc.text(`Proposed Payment - ${formatInvoiceDate(simulation.simulationDate)}`, margin, yPos)
    yPos += 0.5 // 2-3 lines of spacing

    // Fixed column positions for proper vertical alignment
    const col1Start = margin                    // Invoice number (left-aligned)
    const col2Start = margin + 1.0              // Amount column start
    const col2End = margin + 2.2                // Amount column end (for right-alignment)
    const col3Start = margin + 2.5              // Due date column start
    const col4Start = margin + 4.5              // Type column start - much more space from due date
    const col5Start = margin + 5.3              // dpd column start - adjusted accordingly

    // Invoice lines - simple text format with fixed column alignment
    doc.setFontSize(14)
    invoices.forEach((inv) => {
      const daysPastDue = calculateDaysPastDue(inv.dueDate)
      const dpdText = daysPastDue > 0 ? `${daysPastDue} dpd` : ''
      
      // Invoice number (bold, left-aligned in column 1)
      doc.setFont('courier', 'bold')
      doc.text(inv.invoiceNumber, col1Start, yPos)
      
      // Amount (right-aligned in column 2)
      doc.setFont('courier', 'normal')
      const amount = formatAmount(inv.amount)
      const amountWidth = doc.getTextWidth(amount)
      doc.text(amount, col2End - amountWidth, yPos)
      
      // Due date (left-aligned in column 3)
      doc.text(`Due ${formatInvoiceDate(inv.dueDate)}`, col3Start, yPos)
      
      // Type (left-aligned in column 4)
      doc.text(inv.type, col4Start, yPos)
      
      // dpd (left-aligned in column 5, if applicable)
      if (dpdText) {
        doc.text(dpdText, col5Start, yPos)
      }
      
      yPos += 0.2
    })

    // Spacing before total (moved up one line)
    yPos += 0.1

    // Total (bold, right-aligned with amounts in column 2)
    doc.setFont('courier', 'bold')
    doc.setFontSize(14)
    const totalText = formatAmount(totalAmount)
    const totalWidth = doc.getTextWidth(totalText)
    doc.text(totalText, col2End - totalWidth, yPos)
    yPos += 0.2

    // Planned date and ref (aligned with Due date column, bold, black)
    doc.setFont('courier', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0) // Black
    doc.text(`planned ${formatInvoiceDate(simulation.simulationDate)}`, col3Start, yPos)
    yPos += 0.15
    doc.text('Ref pending', col3Start, yPos)
    yPos += 0.5 // Two lines of spacing before Balance Information

    // Balance Information — Westline and the combined suggestion sit side by side.
    if (proposedBalances) {
      doc.setFont('courier', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(0, 0, 0)
      doc.text('Balance Information', margin, yPos)
      yPos += 0.18

      const gap = 0.12
      const cardW = (pageWidth - margin * 2 - gap) / 2
      const leftX = margin
      const rightX = margin + cardW + gap
      const westlineAfterColor: [number, number, number] =
        proposedBalances.westlineAfter >= 0 ? [21, 128, 61] : [220, 38, 38]
      doc.setFont('courier', 'normal')
      doc.setFontSize(8)
      const checksNoteMaxW = cardW - 0.28
      const checksNoteTokens = ['Checks pending transactions not shown.', 'Click here']
      const checksNoteLines: string[] = []
      let checksNoteCurrent = ''
      for (const token of checksNoteTokens) {
        const candidate = checksNoteCurrent ? `${checksNoteCurrent} ${token}` : token
        if (doc.getTextWidth(candidate) <= checksNoteMaxW) {
          checksNoteCurrent = candidate
        } else {
          if (checksNoteCurrent) checksNoteLines.push(checksNoteCurrent)
          checksNoteCurrent = token
        }
      }
      if (checksNoteCurrent) checksNoteLines.push(checksNoteCurrent)
      const cardH = 1.78 + checksNoteLines.length * 0.14

      const drawFootnoteLine = (
        line: string,
        x: number,
        lineY: number,
        color: [number, number, number]
      ) => {
        const clickLabel = 'Click here'
        const clickAt = line.indexOf(clickLabel)
        doc.setFont('courier', 'normal')
        doc.setFontSize(8)
        if (clickAt === -1) {
          doc.setTextColor(...color)
          doc.text(line, x, lineY)
          return
        }
        const before = line.slice(0, clickAt)
        doc.setTextColor(...color)
        doc.text(before, x, lineY)
        const beforeWidth = doc.getTextWidth(before)
        doc.setTextColor(29, 78, 216)
        const clickX = x + beforeWidth
        doc.text(clickLabel, clickX, lineY)
        const clickWidth = doc.getTextWidth(clickLabel)
        doc.setDrawColor(29, 78, 216)
        doc.setLineWidth(0.006)
        doc.line(clickX, lineY + 0.015, clickX + clickWidth, lineY + 0.015)
      }

      const drawCard = (
        x: number,
        fill: [number, number, number],
        stroke: [number, number, number],
        dashed: boolean,
        accent: boolean,
        title: string,
        subtitle: string,
        rows: Array<{ label: string; value: string; color?: [number, number, number] }>,
        footnotes: string[]
      ) => {
        doc.setFillColor(...fill)
        doc.setDrawColor(...stroke)
        doc.setLineWidth(0.012)
        doc.setLineDashPattern(dashed ? [0.05, 0.03] : [], 0)
        doc.roundedRect(x, yPos, cardW, cardH, 0.06, 0.06, 'FD')
        doc.setLineDashPattern([], 0)
        if (accent) {
          doc.setFillColor(...stroke)
          doc.roundedRect(x, yPos, 0.07, cardH, 0.06, 0.06, 'F')
          doc.rect(x + 0.03, yPos, 0.05, cardH, 'F')
        }

        let ty = yPos + 0.24
        doc.setFont('courier', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(...stroke)
        doc.text(title, x + 0.16, ty)
        ty += 0.16
        doc.setFont('courier', 'normal')
        doc.setFontSize(9)
        doc.text(subtitle, x + 0.16, ty)
        ty += 0.24

        rows.forEach((row) => {
          doc.setFont('courier', 'normal')
          doc.setFontSize(11)
          doc.setTextColor(31, 41, 55)
          doc.text(row.label, x + 0.16, ty)
          doc.setFont('courier', 'bold')
          doc.setTextColor(...(row.color ?? [31, 41, 55]))
          const amountWidth = doc.getTextWidth(row.value)
          doc.text(row.value, x + cardW - 0.12 - amountWidth, ty)
          ty += 0.2
        })

        footnotes.forEach((line, index) => {
          const lineY = yPos + cardH - 0.16 - (footnotes.length - 1 - index) * 0.14
          drawFootnoteLine(line, x + 0.16, lineY, stroke)
        })
      }

      drawCard(
        leftX,
        [239, 246, 255],
        [37, 99, 235],
        false,
        true,
        'WESTLINE',
        'Used for payment',
        [
          { label: 'Balance before', value: formatAmount(proposedBalances.westlineBefore) },
          {
            label: 'Balance after',
            value: formatAmount(proposedBalances.westlineAfter),
            color: westlineAfterColor
          }
        ],
        []
      )
      drawCard(
        rightX,
        [255, 251, 235],
        [146, 64, 14],
        true,
        false,
        'SUGGESTION ONLY',
        'Combined - Westline + Total Auto',
        [
          { label: 'Total Auto', value: formatAmount(proposedBalances.totalAutoAvailable) },
          { label: 'Balance before', value: formatAmount(proposedBalances.combinedBefore) },
          { label: 'Balance after', value: formatAmount(proposedBalances.combinedAfter) }
        ],
        ['Fuel is still paid from Westline.', ...checksNoteLines]
      )

      yPos += cardH + 0.28
      doc.setTextColor(0, 0, 0)
      doc.setFont('courier', 'normal')
    }

    // Other Unpaid Invoices Section
    if (otherUnpaidInvoices.length > 0) {
      doc.setFont('courier', 'bold')
      doc.setFontSize(16)
      doc.text('Other Unpaid Invoices', margin, yPos)
      yPos += 0.25

      // Other unpaid invoices - using same fixed column positions
      doc.setFontSize(14)
      otherUnpaidInvoices.forEach((inv) => {
        const daysPastDue = calculateDaysPastDue(inv.dueDate)
        const dpdText = daysPastDue > 0 ? `${daysPastDue} dpd` : ''
        
        // Invoice number (bold, left-aligned in column 1)
        doc.setFont('courier', 'bold')
        doc.text(inv.invoiceNumber, col1Start, yPos)
        
        // Amount (right-aligned in column 2)
        doc.setFont('courier', 'normal')
        const amount = formatAmount(inv.amount)
        const amountWidth = doc.getTextWidth(amount)
        doc.text(amount, col2End - amountWidth, yPos)
        
        // Due date (left-aligned in column 3)
        doc.text(`Due ${formatInvoiceDate(inv.dueDate)}`, col3Start, yPos)
        
        // Type (left-aligned in column 4)
        doc.text(inv.type, col4Start, yPos)
        
        // dpd (left-aligned in column 5, if applicable)
        if (dpdText) {
          doc.text(dpdText, col5Start, yPos)
        }
        
        yPos += 0.2
      })
    }

    // DRAFT Watermark
    doc.setFontSize(72)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0, 0.15) // Dark gray with low opacity
    doc.text('DRAFT', pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: -45
    })

    // Reset text color
    doc.setTextColor(0, 0, 0)

    // Generate PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="proposed-payment-${formatInvoiceDate(simulation.simulationDate).replace(/\//g, '-')}.pdf"`
      }
    })
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}

