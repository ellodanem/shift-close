import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureCustomerPaymentsInCashbook } from '@/lib/cashbook-customer-payment'
import { isCashbookAccount, resolveCashbookAccount } from '@/lib/cashbook-accounts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const type = searchParams.get('type') // 'income' | 'expense'
    const categoryId = searchParams.get('categoryId')
    const account = searchParams.get('account')
    const needsReview = searchParams.get('review') === '1'

    await ensureCustomerPaymentsInCashbook()

    const where: Record<string, unknown> = {}
    if (isCashbookAccount(account)) where.account = account
    if (needsReview) where.accountSource = 'backfill'
    if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate }
    } else if (startDate) {
      where.date = { gte: startDate }
    } else if (endDate) {
      where.date = { lte: endDate }
    }

    const allocFilter: Record<string, unknown> = {}
    if (type === 'income' || type === 'expense') {
      allocFilter.category = { type }
    }
    if (categoryId) {
      allocFilter.categoryId = categoryId
    }
    if (Object.keys(allocFilter).length > 0) {
      where.allocations = { some: allocFilter }
    }

    const entries = await prisma.cashbookEntry.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        allocations: {
          include: { category: true }
        }
      }
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error('Error fetching cashbook entries:', error)
    return NextResponse.json({ error: 'Failed to fetch cashbook entries' }, { status: 500 })
  }
}

/** Map type + paymentMethod to debit/credit columns */
function mapToDebitCredit(
  type: 'income' | 'expense',
  paymentMethod: string | null | undefined,
  amount: number
): {
  debitCash: number
  debitCheck: number
  debitEcard: number
  debitDcard: number
  creditAmt: number
  paymentMethod: string | null
} {
  const amt = Math.abs(Number(amount)) || 0
  const base = { debitCash: 0, debitCheck: 0, debitEcard: 0, debitDcard: 0, creditAmt: 0, paymentMethod: null as string | null }

  if (type === 'income') {
    return { ...base, creditAmt: amt }
  }

  // Expense: map payment method to debit column
  const pm = (paymentMethod || 'cash').toLowerCase()
  if (pm === 'check') return { ...base, debitCheck: amt, paymentMethod: 'check' }
  if (pm === 'deposit' || pm === 'eft' || pm === 'direct_debit') return { ...base, debitEcard: amt, paymentMethod: pm }
  if (pm === 'debit_credit' || pm === 'debit/credit') return { ...base, debitDcard: amt, paymentMethod: 'debit_credit' }
  return { ...base, debitCash: amt, paymentMethod: 'cash' }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      date,
      ref,
      description,
      type,
      paymentMethod,
      debitCash,
      debitEcard,
      debitDcard,
      debitCheck,
      creditAmt,
      bank,
      categoryId,
      amount,
      shiftId,
      paymentBatchId,
      forceDuplicate,
      account
    } = body as {
      date?: string
      ref?: string | null
      description?: string
      type?: 'income' | 'expense'
      paymentMethod?: string | null
      debitCash?: number
      debitEcard?: number
      debitDcard?: number
      debitCheck?: number
      creditAmt?: number
      bank?: string | null
      categoryId?: string
      amount?: number
      shiftId?: string | null
      paymentBatchId?: string | null
      forceDuplicate?: boolean
      account?: string | null
    }

    if (!date || !date.trim()) {
      return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 })
    }
    if (!description || !description.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }
    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
    }
    const amt = typeof amount === 'number' && !Number.isNaN(amount) ? amount : 0

    if (account != null && account !== '' && !isCashbookAccount(account)) {
      return NextResponse.json({ error: 'Choose Westline or Service Station' }, { status: 400 })
    }
    const chosenCategory = await prisma.cashbookCategory.findUnique({
      where: { id: categoryId },
      select: { name: true }
    })
    const resolved = resolveCashbookAccount({
      origin: 'manual',
      explicit: isCashbookAccount(account) ? account : null,
      type: type === 'income' || type === 'expense' ? type : undefined,
      categoryName: chosenCategory?.name,
      description
    })

    // Double-entry rule: check for possible duplicate (same account, date, type, amount)
    if ((type === 'income' || type === 'expense') && amt > 0 && !forceDuplicate) {
      const matches = await prisma.cashbookEntry.findMany({
        where: {
          account: resolved.account,
          date: date.trim(),
          allocations: {
            some: {
              category: { type },
              amount: { gte: amt - 0.01, lte: amt + 0.01 }
            }
          }
        },
        include: {
          allocations: { include: { category: true } }
        }
      })
      if (matches.length > 0) {
        const matchList = matches.map((m) => {
          const alloc = m.allocations[0]
          return {
            id: m.id,
            date: m.date,
            amount: alloc?.amount ?? 0,
            category: alloc?.category.name ?? '—',
            description: m.description
          }
        })
        return NextResponse.json(
          {
            error: 'Possible duplicate',
            duplicate: true,
            matches: matchList
          },
          { status: 409 }
        )
      }
    }

    // Simple mode: type + paymentMethod + amount
    let data: {
      date: string
      ref: string | null
      description: string
      debitCash: number
      debitCheck: number
      debitEcard: number
      debitDcard: number
      creditAmt: number
      bank: string | null
      paymentMethod: string | null
      shiftId: string | null
      paymentBatchId: string | null
    }

    if (type === 'income' || type === 'expense') {
      const mapped = mapToDebitCredit(type, paymentMethod, amt)
      data = {
        date: date.trim(),
        ref: ref?.trim() || null,
        description: description.trim(),
        debitCash: mapped.debitCash,
        debitCheck: mapped.debitCheck,
        debitEcard: mapped.debitEcard,
        debitDcard: mapped.debitDcard,
        creditAmt: mapped.creditAmt,
        bank: bank?.trim() || null,
        paymentMethod: mapped.paymentMethod,
        shiftId: shiftId || null,
        paymentBatchId: paymentBatchId || null
      }
    } else {
      // Legacy: explicit columns
      data = {
        date: date.trim(),
        ref: ref?.trim() || null,
        description: description.trim(),
        debitCash: Number(debitCash) ?? 0,
        debitCheck: Number(debitCheck) ?? 0,
        debitEcard: Number(debitEcard) ?? 0,
        debitDcard: Number(debitDcard) ?? 0,
        creditAmt: Number(creditAmt) ?? 0,
        bank: bank?.trim() || null,
        paymentMethod: null,
        shiftId: shiftId || null,
        paymentBatchId: paymentBatchId || null
      }
    }

    const entry = await prisma.cashbookEntry.create({
      data: {
        ...data,
        account: resolved.account,
        accountSource: resolved.source,
        allocations: {
          create: {
            categoryId,
            amount: amt
          }
        }
      },
      include: {
        allocations: {
          include: { category: true }
        }
      }
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error creating cashbook entry:', error)
    return NextResponse.json({ error: 'Failed to create cashbook entry' }, { status: 500 })
  }
}

