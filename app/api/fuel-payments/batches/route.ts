import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET all batches (with optional filters)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const month = searchParams.get('month') // Format: "2026-01"
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {}

    if (month) {
      const [year, monthNum] = month.split('-').map(Number)
      const monthStart = new Date(year, monthNum - 1, 1)
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999)
      where.paymentDate = {
        gte: monthStart,
        lte: monthEnd
      }
    } else if (startDate && endDate) {
      where.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }

    const batches = await prisma.paymentBatch.findMany({
      where,
      include: {
        invoices: {
          orderBy: {
            invoiceNumber: 'asc'
          }
        },
        _count: {
          select: {
            invoices: true
          }
        }
      },
      orderBy: [
        { paymentDate: 'desc' },
        { bankRef: 'asc' }
      ]
    })

    // Recalculate totalAmount from invoices (live calculation)
    const batchesWithRecalculatedTotal = batches.map(batch => {
      const calculatedTotal = roundMoney(
        batch.invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
      )
      return {
        ...batch,
        totalAmount: calculatedTotal
      }
    })

    return NextResponse.json(batchesWithRecalculatedTotal)
  } catch (error) {
    console.error('Error fetching payment batches:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payment batches' },
      { status: 500 }
    )
  }
}

// POST create new batch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { paymentDate, bankRef, invoices } = body

    if (!paymentDate || !bankRef) {
      return NextResponse.json(
        { error: 'paymentDate and bankRef are required' },
        { status: 400 }
      )
    }

    // Validate date format
    const paymentDateObj = new Date(paymentDate)
    if (isNaN(paymentDateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid paymentDate format' },
        { status: 400 }
      )
    }

    // Check for duplicate (paymentDate + bankRef)
    const existing = await prisma.paymentBatch.findUnique({
      where: {
        paymentDate_bankRef: {
          paymentDate: paymentDateObj,
          bankRef: bankRef.trim()
        }
      }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A batch with this payment date and bank reference already exists' },
        { status: 409 }
      )
    }

    // Calculate total from invoices if provided
    let totalAmount = 0
    if (Array.isArray(invoices) && invoices.length > 0) {
      totalAmount = roundMoney(
        invoices.reduce((sum: number, inv: any) => {
          return sum + roundMoney(Number(inv.amount) || 0)
        }, 0)
      )
    }

    // Create batch with invoices in a transaction
    const batch = await prisma.paymentBatch.create({
      data: {
        paymentDate: paymentDateObj,
        bankRef: bankRef.trim(),
        totalAmount,
        invoices: invoices && Array.isArray(invoices) ? {
          create: invoices.map((inv: any) => ({
            invoiceNumber: inv.invoiceNumber?.trim() || '',
            amount: roundMoney(Number(inv.amount) || 0),
            type: inv.type?.trim() || 'fuel',
            invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : paymentDateObj,
            dueDate: inv.dueDate ? new Date(inv.dueDate) : paymentDateObj,
            notes: inv.notes?.trim() || ''
          }))
        } : undefined
      },
      include: {
        invoices: {
          orderBy: {
            invoiceNumber: 'asc'
          }
        }
      }
    })

    // Recalculate totalAmount
    const calculatedTotal = roundMoney(
      batch.invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    return NextResponse.json({
      ...batch,
      totalAmount: calculatedTotal
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating payment batch:', error)
    
    // Handle Prisma unique constraint error
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A batch with this payment date and bank reference already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create payment batch' },
      { status: 500 }
    )
  }
}

