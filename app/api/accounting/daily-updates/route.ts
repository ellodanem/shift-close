import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { canUseAccountingModule } from '@/lib/roles'
import { buildAccountantDailyUpdates } from '@/lib/accountant-daily-updates'
import { businessTodayYmd } from '@/lib/datetime-policy'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !canUseAccountingModule(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const month = request.nextUrl.searchParams.get('month')?.trim() || businessTodayYmd().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  try {
    const shifts = await prisma.shiftClose.findMany({
      where: {
        date: { startsWith: `${month}-` },
        status: { in: ['closed', 'submitted'] }
      },
      select: {
        id: true,
        date: true,
        shift: true,
        status: true,
        deposits: true,
        otherCredit: true,
        systemDebit: true,
        unleaded: true,
        diesel: true
      }
    })

    return NextResponse.json(buildAccountantDailyUpdates(shifts), {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Accountant daily updates failed', error)
    return NextResponse.json({ error: 'Failed to load daily updates' }, { status: 500 })
  }
}
