import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id },
      include: { vendor: true }
    })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error fetching vendor invoice:', error)
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const invoice = await prisma.vendorInvoice.findUnique({ where: { id } })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Cannot edit a paid invoice' }, { status: 400 })
    }

    const body = await request.json()
    const { invoiceNumber, amount, invoiceDate, dueDate, vat, notes } = body

    const data: Record<string, unknown> = {}
    if (invoiceNumber !== undefined) data.invoiceNumber = String(invoiceNumber).trim()
    if (amount !== undefined) data.amount = Math.round(Number(amount) * 100) / 100
    if (invoiceDate !== undefined) {
      const d = new Date(String(invoiceDate))
      if (!isNaN(d.getTime())) data.invoiceDate = d
    }
    if (dueDate !== undefined) {
      const d = new Date(String(dueDate))
      if (!isNaN(d.getTime())) data.dueDate = d
    }
    if (vat !== undefined) data.vat = Math.round(Number(vat) * 100) / 100
    if (notes !== undefined) data.notes = String(notes).trim()

    const updated = await prisma.vendorInvoice.update({
      where: { id },
      data
    })
    return NextResponse.json(updated)
  } catch (error: unknown) {
    console.error('Error updating vendor invoice:', error)
    const err = error as { code?: string }
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'An invoice with this number already exists for this vendor' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const invoice = await prisma.vendorInvoice.findUnique({ where: { id } })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Cannot delete a paid invoice' }, { status: 400 })
    }

    await prisma.vendorInvoice.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting vendor invoice:', error)
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
  }
}
