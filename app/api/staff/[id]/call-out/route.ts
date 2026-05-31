import { NextRequest, NextResponse } from 'next/server'
import { normalizeCallOutDate, requireCallOutWrite } from '@/lib/call-outs'
import { formatAppUserDisplayName } from '@/lib/roles'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function serializeCallOut(row: {
  id: string
  staffId: string
  date: string
  calledAt: Date
  notes: string
  recordedByUserId: string | null
  createdAt: Date
  updatedAt: Date
  recordedBy?: {
    id: string
    username: string
    firstName: string | null
    lastName: string | null
  } | null
}) {
  return {
    id: row.id,
    staffId: row.staffId,
    date: row.date,
    calledAt: row.calledAt.toISOString(),
    notes: row.notes,
    recordedByUserId: row.recordedByUserId,
    recordedByLabel: row.recordedBy ? formatAppUserDisplayName(row.recordedBy) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

const includeRecordedBy = {
  recordedBy: {
    select: { id: true, username: true, firstName: true, lastName: true }
  }
} as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rows = await prisma.staffCallOut.findMany({
      where: { staffId: id },
      include: includeRecordedBy,
      orderBy: { date: 'desc' }
    })
    return NextResponse.json(rows.map(serializeCallOut))
  } catch (error) {
    console.error('Error fetching staff call outs:', error)
    return NextResponse.json({ error: 'Failed to fetch call outs' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCallOutWrite(request)
  if (auth instanceof NextResponse) return auth
  const { session } = auth

  try {
    const { id } = await params
    const body = await request.json()
    const { date, notes, calledAt } = body as {
      date?: string
      notes?: string
      calledAt?: string
    }

    const normalizedDate = normalizeCallOutDate(date ?? '')
    if (!normalizedDate) {
      return NextResponse.json(
        { error: 'date is required (use YYYY-MM-DD or DD/MM/YYYY)' },
        { status: 400 }
      )
    }

    const staff = await prisma.staff.findUnique({ where: { id }, select: { id: true } })
    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    let calledAtDate = new Date()
    if (calledAt) {
      const parsed = new Date(calledAt)
      if (!Number.isNaN(parsed.getTime())) calledAtDate = parsed
    }

    const record = await prisma.staffCallOut.upsert({
      where: {
        staff_call_out_staff_date: {
          staffId: id,
          date: normalizedDate
        }
      },
      update: {
        notes: notes?.trim() ?? '',
        calledAt: calledAtDate,
        recordedByUserId: session.userId
      },
      create: {
        staffId: id,
        date: normalizedDate,
        notes: notes?.trim() ?? '',
        calledAt: calledAtDate,
        recordedByUserId: session.userId
      },
      include: includeRecordedBy
    })

    return NextResponse.json(serializeCallOut(record), { status: 201 })
  } catch (error) {
    console.error('Error saving staff call out:', error)
    const message = error instanceof Error ? error.message : 'Failed to save call out'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
