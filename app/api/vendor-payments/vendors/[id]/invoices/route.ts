import { NextRequest, NextResponse } from 'next/server'
import { parseInvoiceDateToUTC } from '@/lib/invoiceHelpers'
import { isOverheadCashbookCategory } from '@/lib/overhead-categories'
import { prisma } from '@/lib/prisma'
import { isAccountantRequest } from '@/lib/accounting-submission'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vendorId } = await params
    const accountantRequest = await isAccountantRequest(request)
    const [invoices, vendor] = await Promise.all([prisma.vendorInvoice.findMany({
      where: { vendorId, ...(accountantRequest ? { submittedToAccounting: true } : {}) },
      orderBy: [{ invoiceDate: 'desc' }, { invoiceNumber: 'asc' }]
    }), prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } })])
    return NextResponse.json(invoices.map((invoice) => ({ ...invoice, payeeName: vendor?.name ?? '' })))
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
    const { invoiceNumber, amount, invoiceDate, dueDate, vat, notes, categoryId } = body
    const submittedToAccounting = body.submittedToAccounting !== false

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

    const invDate = parseInvoiceDateToUTC(String(invoiceDate))
    if (isNaN(invDate.getTime())) {
      return NextResponse.json({ error: 'Invalid invoiceDate format' }, { status: 400 })
    }

    let dueDateObj: Date | null = null
    if (dueDate !== undefined && dueDate !== null && String(dueDate).trim() !== '') {
      const d = parseInvoiceDateToUTC(String(dueDate))
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid dueDate format' }, { status: 400 })
      }
      dueDateObj = d
    }

    const amt = Math.round(Number(amount) * 100) / 100
    const vatVal = vat !== undefined && vat !== null ? Math.round(Number(vat) * 100) / 100 : 0

    let resolvedCategoryId: string | null = null
    if (categoryId !== undefined && categoryId !== null && String(categoryId).trim() !== '') {
      const category = await prisma.cashbookCategory.findFirst({
        where: { id: String(categoryId).trim(), active: true }
      })
      if (!category || !isOverheadCashbookCategory(category)) {
        return NextResponse.json(
          { error: 'Choose a cashbook expense category that is not already used for vendor or fuel bills.' },
          { status: 400 }
        )
      }
      resolvedCategoryId = category.id
    }

    const invoice = await prisma.vendorInvoice.create({
      data: {
        vendorId,
        invoiceNumber: String(invoiceNumber).trim(),
        amount: amt,
        invoiceDate: invDate,
        dueDate: dueDateObj,
        vat: vatVal,
        status: 'pending',
        submittedToAccounting,
        notes: (notes && String(notes).trim()) || '',
        categoryId: resolvedCategoryId
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
