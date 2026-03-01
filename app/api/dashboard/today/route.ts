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
              staff: { select: { id: true, name: true, firstName: true } },
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
        select: { id: true, name: true, firstName: true }
      })
    ])

    const firstName = (s: { name: string; firstName: string | null }) =>
      (s.firstName && s.firstName.trim()) || s.name.split(' ')[0] || s.name

    const entries = week?.entries ?? []
    const scheduled = entries
      .filter((e) => e.shiftTemplateId != null)
      .map((e) => ({
        staffId: e.staff.id,
        staffName: e.staff.name,
        staffFirstName: firstName(e.staff),
        shiftName: e.shiftTemplate?.name ?? 'Off',
        shiftColor: e.shiftTemplate?.color ?? null
      }))

    const rosterOffToday = entries
      .filter((e) => e.shiftTemplateId == null)
      .map((e) => ({ staffId: e.staff.id, staffName: e.staff.name, staffFirstName: firstName(e.staff) }))

    const offMap = new Map<string, { staffName: string; staffFirstName: string }>()
    rosterOffToday.forEach((s) => offMap.set(s.staffId, { staffName: s.staffName, staffFirstName: s.staffFirstName }))
    vacationStaff.forEach((s) => offMap.set(s.id, { staffName: s.name, staffFirstName: firstName(s) }))
    const off = Array.from(offMap.entries()).map(([staffId, v]) => ({ staffId, staffName: v.staffName, staffFirstName: v.staffFirstName }))

    return NextResponse.json({
      date: today,
      weekStart,
      scheduled,
      onVacation: vacationStaff.map((s) => ({ staffId: s.id, staffName: s.name, staffFirstName: firstName(s) })),
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
