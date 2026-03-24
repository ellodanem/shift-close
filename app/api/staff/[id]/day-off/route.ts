import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Normalize date to YYYY-MM-DD (accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY) */
function normalizeDate(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }
  return null
}

// List and create day-off records for a specific staff member

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const dayOffs = await prisma.staffDayOff.findMany({
      where: { staffId: id },
      orderBy: { date: 'asc' }
    })

    return NextResponse.json(dayOffs)
  } catch (error) {
    console.error('Error fetching staff day off records:', error)
    return NextResponse.json(
      { error: 'Failed to fetch day off records' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { date, reason } = body as { date?: string; reason?: string }

    const normalizedDate = normalizeDate(date ?? '')
    if (!normalizedDate) {
      return NextResponse.json(
        { error: 'date is required (use YYYY-MM-DD or DD/MM/YYYY)' },
        { status: 400 }
      )
    }

    // Verify staff exists
    const staff = await prisma.staff.findUnique({ where: { id }, select: { id: true } })
    if (!staff) {
      return NextResponse.json(
        { error: 'Staff member not found' },
        { status: 404 }
      )
    }

    const record = await prisma.staffDayOff.upsert({
      where: {
        staff_day_off_staff_date: {
          staffId: id,
          date: normalizedDate
        }
      },
      update: {
        reason: reason?.trim() || '',
        status: 'approved'
      },
      create: {
        staffId: id,
        date: normalizedDate,
        reason: reason?.trim() || '',
        status: 'approved'
      }
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Error creating staff day off record:', error)
    const message = error instanceof Error ? error.message : 'Failed to create day off record'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

