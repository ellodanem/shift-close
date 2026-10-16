import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOrCreateExpenseCategory } from '@/lib/cashbook-expense'

export const dynamic = 'force-dynamic'

/** Create a standalone check directly from Check Management. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      date?: unknown
      payee?: unknown
      checkNumber?: unknown
      amount?: unknown
      notes?: unknown
    }

    const date = typeof body.date === 'string' ? body.date.trim() : ''
    const payee = typeof body.payee === 'string' ? body.payee.trim() : ''
    const checkNumber = typeof body.checkNumber === 'string' ? body.checkNumber.trim() : ''
    const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount)
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'A valid check date is required' }, { status: 400 })
    }
    if (!payee) {
      return NextResponse.json({ error: 'Payee or description is required' }, { status: 400 })
    }
    if (!checkNumber) {
      return NextResponse.json({ error: 'Check number is required' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
    }

    const category = await getOrCreateExpenseCategory('Manual checks', null)
    const description = notes ? `${payee} — ${notes}` : payee
    const entry = await prisma.cashbookEntry.create({
      data: {
        date,
        ref: checkNumber,
        description,
        debitCash: 0,
        debitCheck: Math.abs(amount),
        debitEcard: 0,
        debitDcard: 0,
        creditAmt: 0,
        paymentMethod: 'check',
        allocations: {
          create: { categoryId: category.id, amount: Math.abs(amount) }
        }
      }
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error creating manual check:', error)
    return NextResponse.json({ error: 'Failed to add check' }, { status: 500 })
  }
}
