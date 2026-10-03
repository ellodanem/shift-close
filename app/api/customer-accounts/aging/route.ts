import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseAccountingMonth } from '@/lib/accounting-books'
import { buildReceivableAging } from '@/lib/receivable-aging'

// GET /api/customer-accounts/aging?year=2026&month=10
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year'))
    const month = Number(searchParams.get('month'))
    const parsed = parseAccountingMonth(
      `${year}-${String(month).padStart(2, '0')}`
    )
    if (!parsed || Number.isNaN(year) || Number.isNaN(month)) {
      return NextResponse.json({ error: 'year and month are required' }, { status: 400 })
    }

    const [snapshots, lines] = await Promise.all([
      prisma.customerArAccountSnapshot.findMany({
        where: { year: parsed.year, month: parsed.monthNum },
        select: { account: true, opening: true, charges: true, payments: true, closing: true }
      }),
      prisma.customerArLedgerLine.findMany({
        where: { date: { lte: parsed.end } },
        select: { account: true, date: true, lineType: true, amount: true }
      })
    ])

    const receivable = buildReceivableAging({
      end: parsed.end,
      snapshots,
      lines
    })

    return NextResponse.json(receivable.strip)
  } catch (error) {
    console.error('Error fetching customer A/R aging:', error)
    return NextResponse.json({ error: 'Failed to fetch receivable aging' }, { status: 500 })
  }
}
