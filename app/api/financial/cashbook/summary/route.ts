import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET /api/financial/cashbook/summary?startDate=...&endDate=...
 * Returns income/expense totals by category type for the date range.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate (YYYY-MM-DD) are required' },
        { status: 400 }
      )
    }

    const entries = await prisma.cashbookEntry.findMany({
      where: {
        date: { gte: startDate, lte: endDate }
      },
      include: {
        allocations: {
          include: { category: true }
        }
      },
      orderBy: [{ date: 'asc' }]
    })

    // Aggregate by category type
    let totalIncome = 0
    let totalExpense = 0
    let totalOther = 0
    const byCategory: Array<{ id: string; name: string; type: string; amount: number }> = []
    const categoryTotals = new Map<string, number>()

    for (const entry of entries) {
      for (const alloc of entry.allocations) {
        const amt = alloc.amount
        const type = alloc.category.type || 'expense'
        if (type === 'income') totalIncome += amt
        else if (type === 'expense') totalExpense += amt
        else totalOther += amt

        const key = alloc.category.id
        categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + amt)
      }
    }

    // Build category breakdown (unique categories with totals)
    const catInfo = new Map<string, { name: string; type: string }>()
    for (const entry of entries) {
      for (const alloc of entry.allocations) {
        const cat = alloc.category
        if (!catInfo.has(cat.id)) {
          catInfo.set(cat.id, { name: cat.name, type: cat.type || 'expense' })
        }
      }
    }
    for (const [id, info] of catInfo) {
      const amount = categoryTotals.get(id) ?? 0
      if (amount !== 0) {
        byCategory.push({ id, ...info, amount })
      }
    }
    byCategory.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

    // Also sum entry-level debit/credit columns (for reconciliation view)
    let sumDebitCash = 0
    let sumDebitEcard = 0
    let sumDebitDcard = 0
    let sumCreditAmt = 0
    for (const e of entries) {
      sumDebitCash += e.debitCash ?? 0
      sumDebitEcard += e.debitEcard ?? 0
      sumDebitDcard += e.debitDcard ?? 0
      sumCreditAmt += e.creditAmt ?? 0
    }

    return NextResponse.json({
      startDate,
      endDate,
      totalIncome,
      totalExpense,
      totalOther,
      netIncome: totalIncome - totalExpense,
      byCategory,
      debits: {
        cash: sumDebitCash,
        ecard: sumDebitEcard,
        dcard: sumDebitDcard
      },
      credit: sumCreditAmt,
      entryCount: entries.length
    })
  } catch (error) {
    console.error('Error fetching cashbook summary:', error)
    return NextResponse.json({ error: 'Failed to fetch cashbook summary' }, { status: 500 })
  }
}
