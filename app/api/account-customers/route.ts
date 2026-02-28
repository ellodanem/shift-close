/**
 * Account customers (cheque/debit) — list and manage.
 * GET: list all customers with balance (override or computed from items)
 * POST: create/update balance override for a customer
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function makeKey(name: string, method: string) {
  return `${(name || '').toLowerCase()}::${(method || 'cheque').toLowerCase()}`
}

async function getComputedBalances(): Promise<Map<string, { customerName: string; balance: number; paymentMethod: string; shiftDate: string; shiftPeriod: string }>> {
  const items = await prisma.overShortItem.findMany({
    where: {
      itemKind: { in: ['cheque_received', 'debit_received', 'fuel_taken', 'cheque_balance'] },
      newBalance: { gt: 0 }
    },
    include: { shift: { select: { date: true, shift: true } } },
    orderBy: { createdAt: 'desc' }
  })
  const seen = new Map<string, { customerName: string; balance: number; paymentMethod: string; shiftDate: string; shiftPeriod: string }>()
  for (const item of items) {
    const method = item.paymentMethod || 'cheque'
    const key = makeKey(item.customerName || '', method)
    if (!seen.has(key) && item.customerName && item.newBalance != null) {
      seen.set(key, {
        customerName: item.customerName,
        balance: item.newBalance,
        paymentMethod: method,
        shiftDate: item.shift.date,
        shiftPeriod: item.shift.shift
      })
    }
  }
  return seen
}

export async function GET() {
  try {
    const [overrides, computed] = await Promise.all([
      prisma.customerAccountBalance.findMany({ orderBy: { customerName: 'asc' } }),
      getComputedBalances()
    ])

    const byKey = new Map<string, {
      customerName: string
      balance: number
      isOverride: boolean
      paymentMethod?: string
      lastActivity?: string
      notes?: string | null
    }>()

    for (const o of overrides) {
      const method = o.paymentMethod || 'cheque'
      const key = makeKey(o.customerName, method)
      byKey.set(key, {
        customerName: o.customerName,
        balance: o.balanceOverride,
        isOverride: true,
        paymentMethod: method,
        notes: o.notes
      })
    }

    for (const [key, data] of computed) {
      if (!byKey.has(key)) {
        byKey.set(key, {
          customerName: data.customerName,
          balance: data.balance,
          isOverride: false,
          paymentMethod: data.paymentMethod,
          lastActivity: `${data.shiftDate} ${data.shiftPeriod}`
        })
      }
      const existing = byKey.get(key)!
      if (!existing.lastActivity) existing.lastActivity = data.shiftDate + ' ' + data.shiftPeriod
    }

    const list = Array.from(byKey.values())
    list.sort((a, b) => {
      const cmp = a.customerName.localeCompare(b.customerName)
      return cmp !== 0 ? cmp : (a.paymentMethod || '').localeCompare(b.paymentMethod || '')
    })
    return NextResponse.json(list)
  } catch (error) {
    console.error('Account customers GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerName, balance, notes, paymentMethod } = body

    if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }
    const name = customerName.trim()
    const method = (paymentMethod === 'debit' ? 'debit' : 'cheque') as 'cheque' | 'debit'
    const bal = typeof balance === 'number' ? balance : parseFloat(String(balance))
    if (Number.isNaN(bal) || bal < 0) {
      return NextResponse.json({ error: 'Valid balance (≥ 0) is required' }, { status: 400 })
    }

    const updated = await prisma.customerAccountBalance.upsert({
      where: {
        customerName_paymentMethod: { customerName: name, paymentMethod: method }
      },
      create: {
        customerName: name,
        paymentMethod: method,
        balanceOverride: bal,
        notes: notes && typeof notes === 'string' ? notes.trim() || null : null
      },
      update: {
        balanceOverride: bal,
        notes: notes && typeof notes === 'string' ? notes.trim() || null : undefined
      }
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Account customers POST error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to save', details: message },
      { status: 500 }
    )
  }
}
