import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vendorId } = await params
    const invoices = await prisma.vendorInvoice.findMany({
      where: { vendorId },
      orderBy: [{ invoiceDate: 'desc' }, { invoiceNumber: 'asc' }]
    })
    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching vendor invoices:', error)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vendorId } = await params
    const body = await request.json()
    const { invoiceNumber, amount, invoiceDate, dueDate, vat, notes } = body

    if (!invoiceNumber || amount === undefined || !invoiceDate) {
      return NextResponse.json(
        { error: 'invoiceNumber, amount, and invoiceDate are required' },
        { status: 400 }
      )
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    const invDate = new Date(String(invoiceDate))
    if (isNaN(invDate.getTime())) {
      return NextResponse.json({ error: 'Invalid invoiceDate format' }, { status: 400 })
    }

    let dueDateObj: Date
    if (dueDate) {
      dueDateObj = new Date(String(dueDate))
      if (isNaN(dueDateObj.getTime())) {
        return NextResponse.json({ error: 'Invalid dueDate format' }, { status: 400 })
      }
    } else {
      dueDateObj = new Date(invDate)
      dueDateObj.setDate(dueDateObj.getDate() + 5)
    }

    const amt = Math.round(Number(amount) * 100) / 100
    const vatVal = vat !== undefined && vat !== null ? Math.round(Number(vat) * 100) / 100 : 0

    const invoice = await prisma.vendorInvoice.create({
      data: {
        vendorId,
        invoiceNumber: String(invoiceNumber).trim(),
        amount: amt,
        invoiceDate: invDate,
        dueDate: dueDateObj,
        vat: vatVal,
        status: 'pending',
        notes: (notes && String(notes).trim()) || ''
      }
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating vendor invoice:', error)
    const err = error as { code?: string }
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'An invoice with this number already exists for this vendor' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
