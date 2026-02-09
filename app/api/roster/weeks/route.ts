import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Roster week API: load and save weekly assignments
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get('weekStart')

    if (!weekStart) {
      return NextResponse.json(
        { error: 'weekStart (YYYY-MM-DD) is required' },
        { status: 400 }
      )
    }

    const week = await prisma.rosterWeek.findUnique({
      where: { weekStart },
      include: {
        entries: true
      }
    })

    return NextResponse.json({
      week,
      entries: week?.entries ?? []
    })
  } catch (error: any) {
    console.error('Error fetching roster week:', error)
    const message =
      (error && typeof error === 'object' && 'message' in error && (error as any).message) ||
      'Failed to fetch roster week'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      weekStart,
      status,
      notes,
      entries
    } = body as {
      weekStart?: string
      status?: string
      notes?: string
      entries?: {
        staffId: string
        date: string
        shiftTemplateId?: string | null
        position?: string | null
        notes?: string | null
      }[]
    }

    if (!weekStart) {
      return NextResponse.json(
        { error: 'weekStart (YYYY-MM-DD) is required' },
        { status: 400 }
      )
    }

    const safeEntries = Array.isArray(entries) ? entries : []

    const result = await prisma.$transaction(async (tx) => {
      const week = await tx.rosterWeek.upsert({
        where: { weekStart },
        update: {
          status: status || 'draft',
          notes: notes ?? ''
        },
        create: {
          weekStart,
          status: status || 'draft',
          notes: notes ?? ''
        }
      })

      await tx.rosterEntry.deleteMany({
        where: { rosterWeekId: week.id }
      })

      if (safeEntries.length > 0) {
        await tx.rosterEntry.createMany({
          data: safeEntries.map((entry) => ({
            rosterWeekId: week.id,
            staffId: entry.staffId,
            date: entry.date,
            shiftTemplateId: entry.shiftTemplateId || null,
            position: entry.position ?? null,
            notes: entry.notes ?? ''
          }))
        })
      }

      return { weekId: week.id, count: safeEntries.length }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error saving roster week:', error)
    return NextResponse.json({ error: 'Failed to save roster week' }, { status: 500 })
  }
}

