import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET /api/financial/cashbook/description-suggestions?type=expense&q=G4
 * Returns distinct descriptions from cashbook entries, filtered by type and search, excluding user-hidden ones.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as 'income' | 'expense' | null
    const q = (searchParams.get('q') ?? '').trim()

    if (!type || !['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: 'type (income|expense) is required' }, { status: 400 })
    }

    // Income: creditAmt > 0; Expense: any debit > 0
    const amountFilter =
      type === 'income'
        ? { creditAmt: { gt: 0 } }
        : {
            OR: [
              { debitCash: { gt: 0 } },
              { debitCheck: { gt: 0 } },
              { debitEcard: { gt: 0 } },
              { debitDcard: { gt: 0 } }
            ]
          }

    const exclusions = await prisma.cashbookDescriptionExclusion.findMany({
      where: { type },
      select: { description: true }
    })
    const excludeSet = new Set(exclusions.map((e) => e.description.toLowerCase()))

    const entries = await prisma.cashbookEntry.findMany({
      where: {
        ...amountFilter,
        description: { not: '' }
      },
      select: { description: true },
      orderBy: { date: 'desc' },
      take: 500
    })

    const seen = new Set<string>()
    const suggestions: string[] = []
    const qLower = q.toLowerCase()
    for (const e of entries) {
      const d = e.description.trim()
      if (!d || seen.has(d) || excludeSet.has(d.toLowerCase())) continue
      if (q && !d.toLowerCase().includes(qLower)) continue
      seen.add(d)
      suggestions.push(d)
      if (suggestions.length >= 15) break
    }

    return NextResponse.json(suggestions)
  } catch (error) {
    console.error('Error fetching description suggestions:', error)
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 })
  }
}
