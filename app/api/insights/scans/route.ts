import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { canAccessInsightsPages } from '@/lib/roles'

export const dynamic = 'force-dynamic'

/** GET ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD — deposit + debit scan URLs grouped by calendar day */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessInsightsPages(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate required (YYYY-MM-DD)' }, { status: 400 })
  }

  const shifts = await prisma.shiftClose.findMany({
    where: {
      date: { gte: startDate, lte: endDate }
    },
    orderBy: [{ date: 'desc' }, { shift: 'asc' }],
    select: {
      date: true,
      depositScanUrls: true,
      debitScanUrls: true
    }
  })

  const byDay = new Map<string, { deposits: Set<string>; debits: Set<string> }>()

  for (const s of shifts) {
    let depositUrls: string[] = []
    let debitUrls: string[] = []
    try {
      depositUrls = JSON.parse(s.depositScanUrls || '[]')
      if (!Array.isArray(depositUrls)) depositUrls = []
    } catch {
      depositUrls = []
    }
    try {
      debitUrls = JSON.parse(s.debitScanUrls || '[]')
      if (!Array.isArray(debitUrls)) debitUrls = []
    } catch {
      debitUrls = []
    }

    if (!byDay.has(s.date)) {
      byDay.set(s.date, { deposits: new Set(), debits: new Set() })
    }
    const bucket = byDay.get(s.date)!
    for (const u of depositUrls) {
      if (typeof u === 'string' && u.trim()) bucket.deposits.add(u.trim())
    }
    for (const u of debitUrls) {
      if (typeof u === 'string' && u.trim()) bucket.debits.add(u.trim())
    }
  }

  const rows = [...byDay.entries()]
    .map(([date, { deposits, debits }]) => ({
      date,
      depositScanUrls: [...deposits].sort(),
      debitScanUrls: [...debits].sort()
    }))
    .filter((r) => r.depositScanUrls.length > 0 || r.debitScanUrls.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))

  return NextResponse.json({ rows })
}
