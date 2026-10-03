import { NextRequest, NextResponse } from 'next/server'
import { parseInvoiceDateToUTC } from '@/lib/invoiceHelpers'
import { isOverheadCashbookCategory } from '@/lib/overhead-categories'
import { findOrCreateOverheadPayee } from '@/lib/overhead-payee'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { invoiceNumber, amount, invoiceDate, dueDate, categoryId, payeeName } = body

    if (!invoiceNumber || amount === undefined || !invoiceDate) {
      return NextResponse.json(
        { error: 'invoiceNumber, amount, and invoiceDate are required' },
        { status: 400 }
      )
    }
    if (!categoryId || !String(categoryId).trim()) {
      return NextResponse.json({ error: 'Choose the cashbook account for this bill.' }, { status: 400 })
    }

    const category = await prisma.cashbookCategory.findFirst({
      where: { id: String(categoryId).trim(), active: true }
    })
    if (!category || !isOverheadCashbookCategory(category)) {
      return NextResponse.json(
        { error: 'Choose a cashbook expense category that is not already used for vendor or fuel bills.' },
        { status: 400 }
      )
    }

    const namedPayee = typeof payeeName === 'string' ? payeeName.trim() : ''
    if (namedPayee.length > 120) {
      return NextResponse.json({ error: 'Payee name is too long.' }, { status: 400 })
    }
    const payee = await findOrCreateOverheadPayee(namedPayee || category.name)

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
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: 'Enter an amount greater than 0.' }, { status: 400 })
    }

    const invoice = await prisma.vendorInvoice.create({
      data: {
        vendorId: payee.id,
        invoiceNumber: String(invoiceNumber).trim(),
        amount: amt,
        invoiceDate: invDate,
        dueDate: dueDateObj,
        vat: 0,
        status: 'pending',
        notes: '',
        categoryId: category.id
      }
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating overhead bill:', error)
    const err = error as { code?: string }
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'An invoice with this number already exists for this item' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
