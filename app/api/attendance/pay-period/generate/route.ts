import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeNetOverShort } from '@/lib/calculations'

export const dynamic = 'force-dynamic'

/** POST /api/attendance/pay-period/generate
 * Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }
 * Generates pay period summary from attendance logs + shift shortages + vacation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { startDate, endDate } = body as { startDate?: string; endDate?: string }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate required (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T23:59:59.999')
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    /** Count calendar days of sick leave that fall within the pay period */
    function sickDaysInPeriod(sickStart: Date, sickEnd: Date): { days: number; rangeStart: Date; rangeEnd: Date } | null {
      const overlapStart = sickStart > start ? sickStart : start
      const overlapEnd = sickEnd < end ? sickEnd : end
      if (overlapStart > overlapEnd) return null
      const days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
      return { days, rangeStart: overlapStart, rangeEnd: overlapEnd }
    }

    function formatShortDate(d: Date): string {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    // Fetch active staff (non-manager for report)
    const staff = await prisma.staff.findMany({
      where: { status: 'active', role: { not: 'manager' } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, firstName: true, deviceUserId: true, vacationStart: true, vacationEnd: true }
    })

    // Fetch attendance logs in range
    const logs = await prisma.attendanceLog.findMany({
      where: {
        punchTime: { gte: start, lte: end }
      },
      orderBy: { punchTime: 'asc' }
    })

    // Compute hours per staff (in/out pairs)
    const byStaff = new Map<string, Array<{ punchTime: Date; punchType: string }>>()
    for (const log of logs) {
      const key = log.staffId || log.deviceUserId
      if (!key) continue
      if (!byStaff.has(key)) byStaff.set(key, [])
      byStaff.get(key)!.push({ punchTime: log.punchTime, punchType: log.punchType })
    }

    const transTtlByStaff = new Map<string, number>()
    for (const [key, arr] of byStaff) {
      arr.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
      let totalHours = 0
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i].punchType === 'in' && arr[i + 1].punchType === 'out') {
          const hrs = (arr[i + 1].punchTime.getTime() - arr[i].punchTime.getTime()) / (1000 * 60 * 60)
          totalHours += hrs
        }
      }
      transTtlByStaff.set(key, Math.round(totalHours * 100) / 100)
    }

    // Fetch shift shortages (net over/short when negative) per supervisor in range
    const shifts = await prisma.shiftClose.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { in: ['closed', 'reviewed'] }
      },
      include: { overShortItems: true }
    })

    const shortageByStaff = new Map<string, number>()
    for (const shift of shifts) {
      const netOS = computeNetOverShort(
        shift.overShortTotal || 0,
        (shift.overShortItems ?? []).map(i => ({
          type: i.type,
          amount: i.amount,
          noteOnly: i.noteOnly ?? false
        }))
      )
      if (netOS < 0 && shift.supervisorId) {
        const sid = shift.supervisorId
        shortageByStaff.set(sid, (shortageByStaff.get(sid) || 0) + Math.abs(netOS))
      }
    }

    // Fetch sick leave overlapping the pay period (approved only)
    const sickLeaves = await prisma.staffSickLeave.findMany({
      where: {
        status: 'approved',
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      }
    })

    const sickLeaveByStaff = new Map<string, { days: number; ranges: string }>()
    for (const sl of sickLeaves) {
      const sickStart = new Date(sl.startDate + 'T00:00:00')
      const sickEnd = new Date(sl.endDate + 'T23:59:59')
      const overlap = sickDaysInPeriod(sickStart, sickEnd)
      if (!overlap || overlap.days <= 0) continue
      const existing = sickLeaveByStaff.get(sl.staffId)
      const rangeStr = `${formatShortDate(overlap.rangeStart)} – ${formatShortDate(overlap.rangeEnd)}`
      if (existing) {
        sickLeaveByStaff.set(sl.staffId, {
          days: existing.days + overlap.days,
          ranges: existing.ranges ? `${existing.ranges}; ${rangeStr}` : rangeStr
        })
      } else {
        sickLeaveByStaff.set(sl.staffId, { days: overlap.days, ranges: rangeStr })
      }
    }

    // Build rows
    const rows: Array<{ staffId: string; staffName: string; transTtl: number; vacation: string; shortage: number; sickLeaveDays: number; sickLeaveRanges: string }> = []

    for (const s of staff) {
      const transTtl = transTtlByStaff.get(s.id) ?? (s.deviceUserId ? transTtlByStaff.get(s.deviceUserId) ?? 0 : 0)
      let vacation = ''
      if (s.vacationStart && s.vacationEnd) {
        const vacStart = new Date(s.vacationStart)
        const vacEnd = new Date(s.vacationEnd)
        if (vacStart <= end && vacEnd >= start) {
          vacation = '********'
        }
      }
      const shortage = Math.round((shortageByStaff.get(s.id) || 0) * 100) / 100
      const sickLeave = sickLeaveByStaff.get(s.id)

      rows.push({
        staffId: s.id,
        staffName: s.firstName?.trim() || s.name,
        transTtl,
        vacation,
        shortage,
        sickLeaveDays: sickLeave?.days ?? 0,
        sickLeaveRanges: sickLeave?.ranges ?? ''
      })
    }

    const reportDate = new Date().toISOString().slice(0, 10)

    return NextResponse.json({
      startDate,
      endDate,
      reportDate,
      entityName: 'Total Auto Service Station',
      rows
    })
  } catch (error) {
    console.error('Pay period generate error:', error)
    return NextResponse.json({ error: 'Failed to generate pay period' }, { status: 500 })
  }
}
