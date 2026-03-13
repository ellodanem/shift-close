import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// List and create sick leave records for a specific staff member

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const records = await prisma.staffSickLeave.findMany({
      where: { staffId: id },
      include: { documents: true },
      orderBy: { startDate: 'desc' }
    })

    return NextResponse.json(records)
  } catch (error) {
    console.error('Error fetching staff sick leave records:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sick leave records' },
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
    const { startDate, endDate, reason } = body as { startDate?: string; endDate?: string; reason?: string }

    if (!startDate || !startDate.trim()) {
      return NextResponse.json(
        { error: 'startDate (YYYY-MM-DD) is required' },
        { status: 400 }
      )
    }

    const start = startDate.trim()
    const end = (endDate?.trim() || start)
    if (end < start) {
      return NextResponse.json(
        { error: 'endDate must be on or after startDate' },
        { status: 400 }
      )
    }

    const record = await prisma.staffSickLeave.create({
      data: {
        staffId: id,
        startDate: start,
        endDate: end,
        reason: reason?.trim() || '',
        status: 'approved'
      }
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Error creating staff sick leave record:', error)
    return NextResponse.json(
      { error: 'Failed to create sick leave record' },
      { status: 500 }
    )
  }
}
