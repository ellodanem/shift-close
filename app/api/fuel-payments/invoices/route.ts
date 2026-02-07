import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import { parseInvoiceDateToUTC } from '@/lib/invoiceHelpers'

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

    // #region agent log
    if (invoices.length > 0) {
      const first = invoices[0]
      const d = first.invoiceDate
      const iso = d instanceof Date ? d.toISOString() : String(d)
      fetch('http://127.0.0.1:7242/ingest/207c8d6b-3d00-455a-b8dd-a0725bea89f1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/invoices/route.ts:GET',message:'GET list first invoiceDate',data:{invoiceId:first.id,invoiceDateISO:iso,hasZ:iso.includes('Z')},hypothesisId:'H3',timestamp:Date.now()})}).catch(()=>{});
    }
    // #endregion
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

    // Parse as date-only (UTC noon) so calendar day is preserved in all timezones
    const invoiceDateObj = parseInvoiceDateToUTC(String(invoiceDate))
    if (isNaN(invoiceDateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid invoiceDate format' },
        { status: 400 }
      )
    }

    const dueDate = new Date(invoiceDateObj)
    dueDate.setUTCDate(dueDate.getUTCDate() + 5)

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

