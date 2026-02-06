import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET single invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        paidInvoice: {
          include: {
            batch: true
          }
        },
        corrections: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 10
        }
      }
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error fetching invoice:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    )
  }
}

// PATCH update invoice (only if pending)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { invoiceNumber, amount, type, invoiceDate, notes, reason, changedBy } = body

    // Verify invoice exists and is pending
    const existing = await prisma.invoice.findUnique({
      where: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending invoices can be edited' },
        { status: 400 }
      )
    }

    // Build update data
    const updateData: any = {}
    const corrections: any[] = []

    if (invoiceNumber !== undefined && invoiceNumber.trim() !== existing.invoiceNumber) {
      updateData.invoiceNumber = invoiceNumber.trim()
      corrections.push({
        invoiceId: id,
        field: 'invoiceNumber',
        oldValue: existing.invoiceNumber,
        newValue: invoiceNumber.trim(),
        reason: reason || 'Invoice updated',
        changedBy: changedBy || 'admin'
      })
    }

    if (amount !== undefined && roundMoney(Number(amount)) !== roundMoney(existing.amount)) {
      updateData.amount = roundMoney(Number(amount))
      corrections.push({
        invoiceId: id,
        field: 'amount',
        oldValue: existing.amount.toString(),
        newValue: updateData.amount.toString(),
        reason: reason || 'Invoice updated',
        changedBy: changedBy || 'admin'
      })
    }

    if (type !== undefined && type !== existing.type) {
      const validTypes = ['Fuel', 'LPG', 'Lubricants', 'Rent']
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `type must be one of: ${validTypes.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.type = type
      corrections.push({
        invoiceId: id,
        field: 'type',
        oldValue: existing.type,
        newValue: type,
        reason: reason || 'Invoice updated',
        changedBy: changedBy || 'admin'
      })
    }

    if (invoiceDate !== undefined) {
      const invoiceDateObj = new Date(invoiceDate)
      if (isNaN(invoiceDateObj.getTime())) {
        return NextResponse.json(
          { error: 'Invalid invoiceDate format' },
          { status: 400 }
        )
      }

      const oldDueDate = existing.dueDate
      const newDueDate = new Date(invoiceDateObj)
      newDueDate.setDate(newDueDate.getDate() + 5)

      updateData.invoiceDate = invoiceDateObj
      updateData.dueDate = newDueDate

      if (invoiceDateObj.getTime() !== existing.invoiceDate.getTime()) {
        corrections.push({
          invoiceId: id,
          field: 'invoiceDate',
          oldValue: existing.invoiceDate.toISOString(),
          newValue: invoiceDateObj.toISOString(),
          reason: reason || 'Invoice updated',
          changedBy: changedBy || 'admin'
        })
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes.trim()
    }

    // Update invoice
    const updated = await prisma.invoice.update({
      where: { id },
      data: updateData
    })

    // Log corrections
    if (corrections.length > 0) {
      await prisma.invoiceCorrection.createMany({
        data: corrections
      })
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating invoice:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'An invoice with this number already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    )
  }
}

// DELETE invoice (only if pending)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify invoice exists and is pending
    const existing = await prisma.invoice.findUnique({
      where: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending invoices can be deleted' },
        { status: 400 }
      )
    }

    // Delete invoice
    await prisma.invoice.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting invoice:', error)
    return NextResponse.json(
      { error: 'Failed to delete invoice' },
      { status: 500 }
    )
  }
}
