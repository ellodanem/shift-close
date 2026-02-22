import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shifts/cheque-balances
 * Returns the most recent account balance per customer (cheque or debit)
 * where newBalance > 0 — used to auto-fill "Previous Balance" in the modal.
 */
export async function GET() {
  try {
    const items = await prisma.overShortItem.findMany({
      where: {
        itemKind: { in: ['cheque_received', 'debit_received', 'fuel_taken', 'cheque_balance'] },
        newBalance: { gt: 0 }
      },
      include: {
        shift: { select: { date: true, shift: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    const seen = new Map<string, {
      customerName: string
      newBalance: number
      paymentMethod: string
      shiftDate: string
      shiftPeriod: string
    }>()

    for (const item of items) {
      const key = (item.customerName || '').toLowerCase()
      if (!seen.has(key) && item.customerName && item.newBalance != null) {
        seen.set(key, {
          customerName: item.customerName,
          newBalance: item.newBalance,
          paymentMethod: item.paymentMethod || 'cheque',
          shiftDate: item.shift.date,
          shiftPeriod: item.shift.shift
        })
      }
    }

    return NextResponse.json(Array.from(seen.values()))
  } catch (error) {
    console.error('Error fetching account balances:', error)
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 })
  }
}
