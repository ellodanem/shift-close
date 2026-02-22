import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shifts/cheque-balances
 * Returns the most recent cheque balance entry per customer name
 * where newBalance > 0 — used to auto-fill "Previous Balance" in the modal.
 *
 * Response: Array<{ customerName, newBalance, shiftDate, shiftPeriod }>
 */
export async function GET() {
  try {
    // Get all cheque_balance items that have a positive newBalance, most recent first
    const items = await prisma.overShortItem.findMany({
      where: {
        itemKind: 'cheque_balance',
        newBalance: { gt: 0 }
      },
      include: {
        shift: {
          select: { date: true, shift: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Deduplicate: keep only the most recent entry per customerName
    const seen = new Map<string, {
      customerName: string
      newBalance: number
      shiftDate: string
      shiftPeriod: string
    }>()

    for (const item of items) {
      const name = (item.customerName || '').toLowerCase()
      if (!seen.has(name) && item.customerName && item.newBalance != null) {
        seen.set(name, {
          customerName: item.customerName,
          newBalance: item.newBalance,
          shiftDate: item.shift.date,
          shiftPeriod: item.shift.shift
        })
      }
    }

    return NextResponse.json(Array.from(seen.values()))
  } catch (error) {
    console.error('Error fetching cheque balances:', error)
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 })
  }
}
