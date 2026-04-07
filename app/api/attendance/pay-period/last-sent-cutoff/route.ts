import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** First calendar day to show for “current” period: day after endDate of latest *saved* pay period. */
function dayAfterYmd(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * GET /api/attendance/pay-period/last-sent-cutoff
 * Returns { cutoffDate: YYYY-MM-DD | null } — inclusive start for default Attendance log range
 * “Since last pay report”: first day after the latest saved pay period’s endDate.
 * null if no pay period has been saved yet.
 */
export async function GET() {
  try {
    const last = await prisma.payPeriod.findFirst({
      orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }]
    })
    if (!last) {
      return NextResponse.json({ cutoffDate: null })
    }
    return NextResponse.json({ cutoffDate: dayAfterYmd(last.endDate) })
  } catch (error) {
    console.error('last-sent-cutoff error:', error)
    return NextResponse.json({ error: 'Failed to resolve cutoff' }, { status: 500 })
  }
}
