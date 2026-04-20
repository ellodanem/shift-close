import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { canEditRoster } from '@/lib/roles'
import { getStationClosedDates } from '@/lib/public-holidays'

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

    const week = await prisma.rosterWeek.findFirst({
      where: { weekStart },
      include: { entries: true }
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
  const session = await getSessionFromRequest(request)
  if (!session || !canEditRoster(session.role)) {
    return NextResponse.json({ error: 'Roster is view-only for your role' }, { status: 403 })
  }
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

    const distinctDates = [...new Set(safeEntries.map((e) => e.date))]
    const stationClosedDates = await getStationClosedDates(prisma, distinctDates)
    const activeShiftEntries = safeEntries.filter((e) => !!e.shiftTemplateId)
    const shiftStaffIds = [...new Set(activeShiftEntries.map((e) => e.staffId))]
    const minDate = distinctDates.length > 0 ? distinctDates.reduce((a, b) => (a < b ? a : b)) : null
    const maxDate = distinctDates.length > 0 ? distinctDates.reduce((a, b) => (a > b ? a : b)) : null
    const [staffRows, sickLeaves] = await Promise.all([
      shiftStaffIds.length
        ? prisma.staff.findMany({
            where: { id: { in: shiftStaffIds } },
            select: { id: true, vacationStart: true, vacationEnd: true }
          })
        : Promise.resolve([]),
      shiftStaffIds.length && minDate && maxDate
        ? prisma.staffSickLeave.findMany({
            where: {
              staffId: { in: shiftStaffIds },
              status: { not: 'denied' },
              startDate: { lte: maxDate },
              endDate: { gte: minDate }
            },
            select: { staffId: true, startDate: true, endDate: true }
          })
        : Promise.resolve([])
    ])
    const staffById = new Map(staffRows.map((s) => [s.id, s]))
    for (const entry of safeEntries) {
      if (entry.shiftTemplateId && stationClosedDates.has(entry.date)) {
        return NextResponse.json(
          {
            error: `Cannot assign shifts on ${entry.date}: station is closed for this public holiday.`
          },
          { status: 400 }
        )
      }
      if (entry.shiftTemplateId) {
        const staff = staffById.get(entry.staffId)
        if (
          staff?.vacationStart &&
          staff.vacationEnd &&
          staff.vacationStart <= entry.date &&
          staff.vacationEnd >= entry.date
        ) {
          return NextResponse.json(
            {
              error: `Cannot assign shifts on ${entry.date}: staff is on vacation.`
            },
            { status: 400 }
          )
        }
        const onSickLeave = sickLeaves.some(
          (leave) =>
            leave.staffId === entry.staffId &&
            leave.startDate <= entry.date &&
            leave.endDate >= entry.date
        )
        if (onSickLeave) {
          return NextResponse.json(
            {
              error: `Cannot assign shifts on ${entry.date}: staff is on sick leave.`
            },
            { status: 400 }
          )
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Emulate upsert by weekStart (unique) using findFirst + update/create
      const existing = await tx.rosterWeek.findFirst({
        where: { weekStart }
      })

      const week = existing
        ? await tx.rosterWeek.update({
            where: { id: existing.id },
            data: {
              status: status || existing.status || 'draft',
              notes: notes ?? existing.notes ?? ''
            }
          })
        : await tx.rosterWeek.create({
            data: {
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

