import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { roundMoney } from '@/lib/fuelPayments'
import {
  createCashbookExpenseEntry,
  getOrCreateExpenseCategory
} from '@/lib/cashbook-expense'
import {
  dateInReportMonth,
  monthDateBoundsYmd,
  serializeMonthlyReportExpense
} from '@/lib/vendorInvoicePaymentsReport'

export const dynamic = 'force-dynamic'

const MONTH_RE = /^\d{4}-\d{2}$/

function defaultDateForMonth(month: string): string {
  const today = businessTodayYmd()
  if (today.startsWith(`${month}-`)) return today
  return monthDateBoundsYmd(month).min
}

async function resolveCategoryId(categoryId: string | null | undefined) {
  if (categoryId && typeof categoryId === 'string' && categoryId.trim()) {
    const existing = await prisma.cashbookCategory.findFirst({
      where: { id: categoryId.trim(), type: 'expense', active: true }
    })
    if (!existing) {
      return { error: 'Expense category not found' as const, category: null }
    }
    return { error: null, category: existing }
  }
  const fallback = await getOrCreateExpenseCategory('Rec. Gen', '3021')
  return { error: null, category: fallback }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      month,
      description,
      amount,
      paymentMethod,
      ref,
      addToCashbook = false,
      cashbookDate,
      categoryId
    } = body as {
      month?: string
      description?: string
      amount?: number | string
      paymentMethod?: string | null
      ref?: string | null
      addToCashbook?: boolean
      cashbookDate?: string | null
      categoryId?: string | null
    }

    if (!month || !MONTH_RE.test(month)) {
      return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 })
    }

    const desc = typeof description === 'string' ? description.trim() : ''
    if (!desc) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }

    const amt = roundMoney(typeof amount === 'string' ? parseFloat(amount) : Number(amount))
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const method =
      typeof paymentMethod === 'string' && paymentMethod.trim()
        ? paymentMethod.trim().toLowerCase()
        : null
    const reference = typeof ref === 'string' && ref.trim() ? ref.trim() : null

    let cashbookEntryId: string | null = null
    if (addToCashbook) {
      const date = (typeof cashbookDate === 'string' && cashbookDate.trim()) || defaultDateForMonth(month)
      if (!dateInReportMonth(date, month)) {
        return NextResponse.json(
          { error: 'Cashbook date must fall within the report month' },
          { status: 400 }
        )
      }
      const { error, category } = await resolveCategoryId(categoryId)
      if (error || !category) {
        return NextResponse.json({ error: error || 'Expense category is required' }, { status: 400 })
      }
      const entry = await createCashbookExpenseEntry({
        date,
        description: desc,
        amount: amt,
        categoryId: category.id,
        paymentMethod: method,
        ref: reference
      })
      cashbookEntryId = entry.id
    }

    try {
      const row = await prisma.monthlyReportExpense.create({
        data: {
          month,
          description: desc,
          amount: amt,
          paymentMethod: method,
          ref: reference,
          cashbookEntryId
        }
      })
      return NextResponse.json(serializeMonthlyReportExpense(row), { status: 201 })
    } catch (createErr) {
      if (cashbookEntryId) {
        await prisma.cashbookEntry.deleteMany({ where: { id: cashbookEntryId } })
      }
      throw createErr
    }
  } catch (error) {
    console.error('Error creating monthly report expense:', error)
    return NextResponse.json({ error: 'Failed to create additional expense' }, { status: 500 })
  }
}
