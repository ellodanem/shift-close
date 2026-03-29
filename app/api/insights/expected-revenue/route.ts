import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { aggregateRangeRevenue } from '@/lib/insights-revenue'

export const dynamic = 'force-dynamic'

function canAccessInsights(role: string): boolean {
  const r = role?.toLowerCase() ?? ''
  return r === 'stakeholder' || r === 'admin' || r === 'manager'
}

/** GET ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD — expected revenue from shift closes (same formula as dashboard grand total). */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessInsights(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate required (YYYY-MM-DD)' }, { status: 400 })
  }
  if (startDate > endDate) {
    return NextResponse.json({ error: 'startDate must be on or before endDate' }, { status: 400 })
  }

  try {
    const shifts = await prisma.shiftClose.findMany({
      where: {
        date: { gte: startDate, lte: endDate }
      },
      select: {
        date: true,
        deposits: true,
        systemDebit: true,
        otherCredit: true,
        systemFleet: true,
        systemMassyCoupons: true
      }
    })

    const agg = aggregateRangeRevenue(shifts)

    return NextResponse.json({
      startDate,
      endDate,
      ...agg
    })
  } catch (e) {
    console.error('expected-revenue GET', e)
    return NextResponse.json({ error: 'Failed to compute revenue' }, { status: 500 })
  }
}
