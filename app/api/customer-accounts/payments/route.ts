import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET /api/customer-accounts/payments
// Query params: startDate?, endDate?, account?
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const account = searchParams.get('account')

    const where: Record<string, unknown> = {}

    if (startDate || endDate) {
      where.date = {}
      if (startDate) (where.date as Record<string, string>).gte = startDate
      if (endDate) (where.date as Record<string, string>).lte = endDate
    }
    if (account && account.trim()) {
      where.account = { contains: account.trim(), mode: 'insensitive' }
    }

    const payments = await prisma.customerArPayment.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
    })

    return NextResponse.json(payments)
  } catch (error) {
    console.error('Error fetching customer A/R payments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    )
  }
}

// POST /api/customer-accounts/payments
// Body: { date, account, amount, paymentMethod?, ref?, notes? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, account, amount, paymentMethod, ref, notes } = body || {}

    if (!date || typeof date !== 'string' || !date.trim()) {
      return NextResponse.json(
        { error: 'date (YYYY-MM-DD) is required' },
        { status: 400 }
      )
    }
    if (!account || typeof account !== 'string' || !account.trim()) {
      return NextResponse.json(
        { error: 'account (customer name) is required' },
        { status: 400 }
      )
    }
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'amount must be a positive number' },
        { status: 400 }
      )
    }

    const payment = await prisma.customerArPayment.create({
      data: {
        date: date.trim(),
        account: account.trim(),
        amount: roundMoney(amount),
        paymentMethod: paymentMethod && typeof paymentMethod === 'string' ? paymentMethod.trim() || null : null,
        ref: ref && typeof ref === 'string' ? ref.trim() || null : null,
        notes: notes && typeof notes === 'string' ? notes.trim() || '' : ''
      }
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    console.error('Error creating customer A/R payment:', error)
    return NextResponse.json(
      { error: 'Failed to record payment' },
      { status: 500 }
    )
  }
}
