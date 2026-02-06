import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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

    // Calculate balance after for this simulation
    const balanceAfter = balanceRecord 
      ? roundMoney(balanceRecord.availableFunds - planned)
      : 0

    // Fetch other unpaid invoices (excluding the ones in simulation)
    const otherUnpaidInvoices = await prisma.invoice.findMany({
      where: {
        status: 'pending',
        id: { notIn: invoiceIds }
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

    // Balance Information Section
    if (balanceRecord) {
      doc.setFont('courier', 'bold')
      doc.setFontSize(16)
      doc.text('Balance Information', margin, yPos)
      yPos += 0.25

      doc.setFont('courier', 'normal')
      doc.setFontSize(14)
      doc.text(`Balance Before (Available): ${formatAmount(balanceRecord.availableFunds)}`, margin, yPos)
      yPos += 0.2
      doc.text(`Balance After (Available - Planned): ${formatAmount(balanceAfter)}`, margin, yPos)
      yPos += 0.45 // One extra line of spacing before Other Unpaid Invoices
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

