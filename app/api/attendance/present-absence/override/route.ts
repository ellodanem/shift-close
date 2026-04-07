import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** POST { staffId, date, manualPresent?, manualAbsent? (punch-exempt only), lateReason? } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const staffId = typeof body.staffId === 'string' ? body.staffId.trim() : ''
    const date = typeof body.date === 'string' ? body.date.trim() : ''
    let manualPresent = body.manualPresent === true
    let manualAbsent = body.manualAbsent === true
    const lateReason = typeof body.lateReason === 'string' ? body.lateReason : ''

    if (!staffId || !DATE_RE.test(date)) {
      return NextResponse.json({ error: 'staffId and date (YYYY-MM-DD) are required' }, { status: 400 })
    }

    const staff = await prisma.staff.findFirst({ where: { id: staffId, status: 'active' } })
    if (!staff) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    }

    const punchExempt = staff.punchExempt === true
    if (!punchExempt) {
      manualAbsent = false
    }
    if (manualAbsent) {
      manualPresent = false
    }

    const shouldPersist = manualPresent || manualAbsent || lateReason.trim().length > 0

    if (!shouldPersist) {
      await prisma.attendanceDayOverride.deleteMany({ where: { staffId, date } })
      return NextResponse.json({ ok: true, cleared: true })
    }

    const existing = await prisma.attendanceDayOverride.findFirst({ where: { staffId, date } })
    const row = existing
      ? await prisma.attendanceDayOverride.update({
          where: { id: existing.id },
          data: {
            manualPresent,
            manualAbsent,
            lateReason: lateReason.trim()
          }
        })
      : await prisma.attendanceDayOverride.create({
          data: {
            staffId,
            date,
            manualPresent,
            manualAbsent,
            lateReason: lateReason.trim()
          }
        })

    return NextResponse.json({
      ok: true,
      override: {
        staffId: row.staffId,
        date: row.date,
        manualPresent: row.manualPresent,
        manualAbsent: row.manualAbsent,
        lateReason: row.lateReason
      }
    })
  } catch (e) {
    console.error('present-absence override POST', e)
    return NextResponse.json({ error: 'Failed to save override' }, { status: 500 })
  }
}
