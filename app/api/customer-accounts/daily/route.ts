import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET /api/customer-accounts/daily?date=YYYY-MM-DD
// Returns every customer who charged on that day, with their line items and total.
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date')?.trim()
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'date is required (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const lines = await prisma.customerArLedgerLine.findMany({
      where: { date, lineType: 'charge' },
      orderBy: [{ account: 'asc' }, { sortOrder: 'asc' }]
    })

    const byAccount = new Map<
      string,
      {
        account: string
        total: number
        lines: { id: string; amount: number; memo: string | null; ref: string | null }[]
      }
    >()

    for (const line of lines) {
      const key = line.account.trim().toLowerCase()
      let entry = byAccount.get(key)
      if (!entry) {
        entry = { account: line.account.trim(), total: 0, lines: [] }
        byAccount.set(key, entry)
      }
      entry.total += line.amount
      entry.lines.push({
        id: line.id,
        amount: roundMoney(line.amount),
        memo: line.memo,
        ref: line.ref
      })
    }

    const customers = Array.from(byAccount.values())
      .map((c) => ({ ...c, total: roundMoney(c.total) }))
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({
      date,
      customers,
      total: roundMoney(customers.reduce((s, c) => s + c.total, 0))
    })
  } catch (error) {
    console.error('Error fetching daily customer charges:', error)
    return NextResponse.json(
      { error: 'Failed to fetch daily charges' },
      { status: 500 }
    )
  }
}
