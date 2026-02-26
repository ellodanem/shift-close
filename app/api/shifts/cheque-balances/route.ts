import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function makeKey(name: string, method: string) {
  return `${(name || '').toLowerCase()}::${(method || 'cheque').toLowerCase()}`
}

/**
 * GET /api/shifts/cheque-balances
 * Returns the most recent account balance per (customer, paymentMethod).
 * Query: ?paymentMethod=cheque|debit to filter.
 */
export async function GET(request: NextRequest) {
  try {
    const paymentFilter = request.nextUrl.searchParams.get('paymentMethod')

    const [overrides, items] = await Promise.all([
      prisma.customerAccountBalance.findMany(),
      prisma.overShortItem.findMany({
        where: {
          itemKind: { in: ['cheque_received', 'debit_received', 'fuel_taken', 'cheque_balance'] },
          newBalance: { gt: 0 }
        },
        include: {
          shift: { select: { date: true, shift: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    ])

    const overrideMap = new Map<string, { customerName: string; balance: number; paymentMethod: string }>()
    for (const o of overrides) {
      const method = o.paymentMethod || 'cheque'
      overrideMap.set(makeKey(o.customerName, method), { customerName: o.customerName, balance: o.balanceOverride, paymentMethod: method })
    }

    const seen = new Map<string, {
      customerName: string
      newBalance: number
      paymentMethod: string
      shiftDate: string
      shiftPeriod: string
    }>()

    for (const item of items) {
      const method = item.paymentMethod || 'cheque'
      const key = makeKey(item.customerName || '', method)
      if (!seen.has(key) && item.customerName && item.newBalance != null) {
        const override = overrideMap.get(key)
        seen.set(key, {
          customerName: item.customerName,
          newBalance: override != null ? override.balance : item.newBalance,
          paymentMethod: method,
          shiftDate: item.shift.date,
          shiftPeriod: item.shift.shift
        })
      }
    }

    for (const o of overrides) {
      const method = o.paymentMethod || 'cheque'
      const key = makeKey(o.customerName, method)
      if (!seen.has(key) && o.balanceOverride > 0) {
        seen.set(key, {
          customerName: o.customerName,
          newBalance: o.balanceOverride,
          paymentMethod: method,
          shiftDate: '',
          shiftPeriod: ''
        })
      }
    }

    let result = Array.from(seen.values())
    if (paymentFilter === 'cheque' || paymentFilter === 'debit') {
      result = result.filter((r) => (r.paymentMethod || 'cheque').toLowerCase() === paymentFilter.toLowerCase())
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching account balances:', error)
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 })
  }
}
