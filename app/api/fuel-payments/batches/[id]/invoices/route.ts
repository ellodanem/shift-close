import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET all invoices for a batch
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify batch exists
    const batch = await prisma.paymentBatch.findUnique({
      where: { id }
    })

    if (!batch) {
      return NextResponse.json(
        { error: 'Payment batch not found' },
        { status: 404 }
      )
    }

    const invoices = await prisma.paidInvoice.findMany({
      where: { batchId: id },
      orderBy: {
        invoiceNumber: 'asc'
      }
    })

    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching invoices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    )
  }
}

// POST create new invoice in batch
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { invoiceNumber, amount, type, invoiceDate, dueDate, notes } = body

    if (!invoiceNumber || amount === undefined) {
      return NextResponse.json(
        { error: 'invoiceNumber and amount are required' },
        { status: 400 }
      )
    }

    // Verify batch exists
    const batch = await prisma.paymentBatch.findUnique({
      where: { id }
    })

    if (!batch) {
      return NextResponse.json(
        { error: 'Payment batch not found' },
        { status: 404 }
      )
    }

    // Create invoice
    const invoice = await prisma.paidInvoice.create({
      data: {
        batchId: id,
        invoiceNumber: invoiceNumber.trim(),
        amount: roundMoney(Number(amount)),
        type: type?.trim() || 'fuel',
        invoiceDate: invoiceDate ? new Date(invoiceDate) : batch.paymentDate,
        dueDate: dueDate ? new Date(dueDate) : batch.paymentDate,
        notes: notes?.trim() || ''
      }
    })

    // Update batch totalAmount
    const allInvoices = await prisma.paidInvoice.findMany({
      where: { batchId: id }
    })
    const newTotal = roundMoney(
      allInvoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    await prisma.paymentBatch.update({
      where: { id },
      data: { totalAmount: newTotal }
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error creating invoice:', error)
    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    )
  }
}

