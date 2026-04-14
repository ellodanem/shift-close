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

/** PATCH /api/attendance/pay-period/[id] — mark emailed, or update rows/notes (audit via updatedAt) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const markEmailSent = Boolean((body as { markEmailSent?: boolean }).markEmailSent)
    const rows = (body as { rows?: unknown }).rows
    const notes = (body as { notes?: unknown }).notes

    const existing = await prisma.payPeriod.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Pay period not found' }, { status: 404 })
    }

    const data: {
      emailSentAt?: Date
      rows?: string
      rowsBeforeLastEdit?: string
      notes?: string
    } = {}

    if (markEmailSent) {
      data.emailSentAt = new Date()
    }

    if (rows !== undefined) {
      if (!Array.isArray(rows)) {
        return NextResponse.json({ error: 'rows must be an array when provided' }, { status: 400 })
      }
      data.rowsBeforeLastEdit = existing.rows
      data.rows = JSON.stringify(rows)
    }

    if (notes !== undefined) {
      data.notes = typeof notes === 'string' ? notes : ''
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Provide markEmailSent, rows, and/or notes' }, { status: 400 })
    }

    const period = await prisma.payPeriod.update({
      where: { id },
      data
    })
    return NextResponse.json(period)
  } catch (error) {
    console.error('Pay period patch error:', error)
    return NextResponse.json({ error: 'Failed to update pay period' }, { status: 500 })
  }
}
