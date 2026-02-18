import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// List and create day-off records for a specific staff member

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { date, reason } = body as { date?: string; reason?: string }

    if (!date || !date.trim()) {
      return NextResponse.json(
        { error: 'date (YYYY-MM-DD) is required' },
        { status: 400 }
      )
    }

    // Upsert so repeated requests for the same staff/date just update the reason
    const record = await prisma.staffDayOff.upsert({
      where: {
        staff_day_off_staff_date: {
          staffId: id,
          date: date.trim()
        }
      },
      update: {
        reason: reason?.trim() || '',
        status: 'approved'
      },
      create: {
        staffId: id,
        date: date.trim(),
        reason: reason?.trim() || '',
        status: 'approved'
      }
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Error creating staff day off record:', error)
    return NextResponse.json(
      { error: 'Failed to create day off record' },
      { status: 500 }
    )
  }
}

