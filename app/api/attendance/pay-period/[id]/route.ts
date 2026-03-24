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

/** PATCH /api/attendance/pay-period/[id] — e.g. mark report as emailed (sets emailSentAt) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const markEmailSent = Boolean((body as { markEmailSent?: boolean }).markEmailSent)

    if (!markEmailSent) {
      return NextResponse.json({ error: 'markEmailSent: true required' }, { status: 400 })
    }

    const existing = await prisma.payPeriod.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Pay period not found' }, { status: 404 })
    }

    const period = await prisma.payPeriod.update({
      where: { id },
      data: { emailSentAt: new Date() }
    })
    return NextResponse.json(period)
  } catch (error) {
    console.error('Pay period patch error:', error)
    return NextResponse.json({ error: 'Failed to update pay period' }, { status: 500 })
  }
}
