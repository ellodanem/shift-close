import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET /api/attendance/pay-period/[id] - Get single saved pay period */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const period = await prisma.payPeriod.findUnique({
      where: { id }
    })
    if (!period) {
      return NextResponse.json({ error: 'Pay period not found' }, { status: 404 })
    }
    return NextResponse.json(period)
  } catch (error) {
    console.error('Pay period get error:', error)
    return NextResponse.json({ error: 'Failed to get pay period' }, { status: 500 })
  }
}
