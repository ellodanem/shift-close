import { NextRequest, NextResponse } from 'next/server'
import { createCashbookExpenseEntry } from '@/lib/cashbook-expense'
import { canUseAccountingModule } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * A balanced expense journal: debit the expense account, credit Westline.
 * Writes one cashbook expense. It does not touch a shift.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !canUseAccountingModule(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const date = typeof body.date === 'string' ? body.date.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
    const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'cash'
    const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount)
    const ref = typeof body.ref === 'string' ? body.ref : ''

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }
    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }
    if (!categoryId) {
      return NextResponse.json({ error: 'Account is required' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
    }

    const category = await prisma.cashbookCategory.findUnique({ where: { id: categoryId } })
    if (!category || category.type === 'income') {
      return NextResponse.json({ error: 'Choose an expense account' }, { status: 400 })
    }

    const entry = await createCashbookExpenseEntry({
      date,
      description,
      amount,
      categoryId,
      paymentMethod,
      ref
    })
    return NextResponse.json({ id: entry.id })
  } catch (error) {
    console.error('Journal entry failed', error)
    return NextResponse.json({ error: 'Failed to post journal entry' }, { status: 500 })
  }
}
