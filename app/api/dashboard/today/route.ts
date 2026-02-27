import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function getTodayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dayStr = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dayStr}`
}

export async function GET() {
  try {
    const today = getTodayISO()
    const weekStart = getMondayOfWeek(new Date(today + 'T12:00:00'))

    const [week, vacationStaff] = await Promise.all([
      prisma.rosterWeek.findFirst({
        where: { weekStart },
        include: {
          entries: {
            where: { date: today, staff: { status: 'active' } },
            include: {
              staff: { select: { id: true, name: true } },
              shiftTemplate: { select: { id: true, name: true, color: true } }
            }
          }
        }
      }),
      prisma.staff.findMany({
        where: {
          status: 'active',
          vacationStart: { not: null },
          vacationEnd: { not: null },
          AND: [
            { vacationStart: { lte: today } },
            { vacationEnd: { gte: today } }
          ]
        },
        select: { id: true, name: true }
      })
    ])

    const entries = week?.entries ?? []
    const scheduled = entries
      .filter((e) => e.shiftTemplateId != null)
      .map((e) => ({
        staffId: e.staff.id,
        staffName: e.staff.name,
        shiftName: e.shiftTemplate?.name ?? 'Off',
        shiftColor: e.shiftTemplate?.color ?? null
      }))

    const rosterOffToday = entries
      .filter((e) => e.shiftTemplateId == null)
      .map((e) => ({ staffId: e.staff.id, staffName: e.staff.name }))

    const offMap = new Map<string, string>()
    rosterOffToday.forEach((s) => offMap.set(s.staffId, s.staffName))
    vacationStaff.forEach((s) => offMap.set(s.id, s.name))
    const off = Array.from(offMap.entries()).map(([staffId, staffName]) => ({ staffId, staffName }))

    return NextResponse.json({
      date: today,
      weekStart,
      scheduled,
      onVacation: vacationStaff.map((s) => ({ staffId: s.id, staffName: s.name })),
      off
    })
  } catch (error) {
    console.error('Error fetching dashboard today:', error)
    return NextResponse.json(
      { error: 'Failed to fetch today\'s roster' },
      { status: 500 }
    )
  }
}
