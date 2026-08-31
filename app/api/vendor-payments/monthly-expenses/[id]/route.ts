import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  createCashbookExpenseEntry,
  getOrCreateExpenseCategory,
  updateCashbookExpenseEntry
} from '@/lib/cashbook-expense'
import {
  dateInReportMonth,
  serializeMonthlyReportExpense
} from '@/lib/vendorInvoicePaymentsReport'

export const dynamic = 'force-dynamic'

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.monthlyReportExpense.findUnique({
      where: { id: params.id }
    })
    if (!existing) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      description,
      amount,
      paymentMethod,
      ref,
      addToCashbook,
      cashbookDate,
      categoryId
    } = body as {
      description?: string
      amount?: number | string
      paymentMethod?: string | null
      ref?: string | null
      addToCashbook?: boolean
      cashbookDate?: string | null
      categoryId?: string | null
    }

    const data: {
      description?: string
      amount?: number
      paymentMethod?: string | null
      ref?: string | null
      cashbookEntryId?: string | null
    } = {}

    if (description !== undefined) {
      const desc = String(description).trim()
      if (!desc) {
        return NextResponse.json({ error: 'Description is required' }, { status: 400 })
      }
      data.description = desc
    }

    if (amount !== undefined) {
      const amt = roundMoney(typeof amount === 'string' ? parseFloat(amount) : Number(amount))
      if (!Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
      }
      data.amount = amt
    }

    if (paymentMethod !== undefined) {
      data.paymentMethod =
        typeof paymentMethod === 'string' && paymentMethod.trim()
          ? paymentMethod.trim().toLowerCase()
          : null
    }
    if (ref !== undefined) {
      data.ref = typeof ref === 'string' && ref.trim() ? ref.trim() : null
    }

    const nextDescription = data.description ?? existing.description
    const nextAmount = data.amount ?? existing.amount
    const nextMethod =
      data.paymentMethod !== undefined ? data.paymentMethod : existing.paymentMethod
    const nextRef = data.ref !== undefined ? data.ref : existing.ref

    if (existing.cashbookEntryId) {
      await updateCashbookExpenseEntry(existing.cashbookEntryId, {
        description: nextDescription,
        amount: nextAmount,
        paymentMethod: nextMethod,
        ref: nextRef,
        ...(typeof cashbookDate === 'string' && dateInReportMonth(cashbookDate, existing.month)
          ? { date: cashbookDate }
          : {}),
        ...(typeof categoryId === 'string' && categoryId.trim() ? { categoryId: categoryId.trim() } : {})
      })
    } else if (addToCashbook) {
      const date =
        typeof cashbookDate === 'string' && cashbookDate.trim()
          ? cashbookDate.trim()
          : `${existing.month}-01`
      if (!dateInReportMonth(date, existing.month)) {
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
        description: nextDescription,
        amount: nextAmount,
        categoryId: category.id,
        paymentMethod: nextMethod,
        ref: nextRef
      })
      data.cashbookEntryId = entry.id
    }

    const updated = await prisma.monthlyReportExpense.update({
      where: { id: params.id },
      data
    })

    return NextResponse.json(serializeMonthlyReportExpense(updated))
  } catch (error) {
    console.error('Error updating monthly report expense:', error)
    return NextResponse.json({ error: 'Failed to update additional expense' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.monthlyReportExpense.findUnique({
      where: { id: params.id }
    })
    if (!existing) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    if (existing.cashbookEntryId) {
      await prisma.cashbookEntry.deleteMany({
        where: { id: existing.cashbookEntryId }
      })
    }

    await prisma.monthlyReportExpense.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting monthly report expense:', error)
    return NextResponse.json({ error: 'Failed to delete additional expense' }, { status: 500 })
  }
}
