import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET all invoices (with status filter)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') // 'pending' | 'simulated' | 'paid' | null (all)

    const where: any = {}
    if (status) {
      where.status = status
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        paidInvoice: {
          include: {
            batch: true
          }
        },
        _count: {
          select: {
            corrections: true
          }
        }
      },
      orderBy: [
        { invoiceDate: 'desc' },
        { invoiceNumber: 'asc' }
      ]
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

// POST create new invoice
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { invoiceNumber, amount, type, invoiceDate, notes } = body

    if (!invoiceNumber || amount === undefined || !type || !invoiceDate) {
      return NextResponse.json(
        { error: 'invoiceNumber, amount, type, and invoiceDate are required' },
        { status: 400 }
      )
    }

    // Validate type
    const validTypes = ['Fuel', 'LPG', 'Lubricants', 'Rent']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Calculate due date (invoiceDate + 5 days)
    const invoiceDateObj = new Date(invoiceDate)
    if (isNaN(invoiceDateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid invoiceDate format' },
        { status: 400 }
      )
    }

    const dueDate = new Date(invoiceDateObj)
    dueDate.setDate(dueDate.getDate() + 5)

    // Check for duplicate invoice number (pending only)
    const existing = await prisma.invoice.findFirst({
      where: {
        invoiceNumber: invoiceNumber.trim(),
        status: 'pending'
      }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'An invoice with this number already exists (pending)' },
        { status: 409 }
      )
    }

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: invoiceNumber.trim(),
        amount: roundMoney(Number(amount)),
        type,
        invoiceDate: invoiceDateObj,
        dueDate,
        notes: notes?.trim() || '',
        status: 'pending'
      }
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error: any) {
    console.error('Error creating invoice:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'An invoice with this number already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    )
  }
}

