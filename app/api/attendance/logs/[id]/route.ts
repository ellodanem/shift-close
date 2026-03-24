import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** PATCH /api/attendance/logs/[id] — correct punch time and/or in/out */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { punchTime, punchType } = body as {
      punchTime?: string
      punchType?: string
    }

    const existing = await prisma.attendanceLog.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 })
    }

    const data: { punchTime?: Date; punchType?: string; correctedAt: Date } = {
      correctedAt: new Date()
    }

    if (punchTime != null && String(punchTime).trim()) {
      const t = new Date(punchTime)
      if (isNaN(t.getTime())) {
        return NextResponse.json({ error: 'Invalid punchTime' }, { status: 400 })
      }
      data.punchTime = t
    }

    if (punchType != null) {
      const pt = String(punchType).toLowerCase().trim()
      if (pt !== 'in' && pt !== 'out') {
        return NextResponse.json({ error: 'punchType must be in or out' }, { status: 400 })
      }
      data.punchType = pt
    }

    if (data.punchTime === undefined && data.punchType === undefined) {
      return NextResponse.json({ error: 'Provide punchTime and/or punchType' }, { status: 400 })
    }

    const log = await prisma.attendanceLog.update({
      where: { id },
      data,
      include: { staff: { select: { id: true, name: true } } }
    })

    return NextResponse.json(log)
  } catch (error) {
    console.error('Attendance log PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update log' }, { status: 500 })
  }
}

/** DELETE /api/attendance/logs/[id] — remove a mistaken punch (use sparingly) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await prisma.attendanceLog.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 })
    }
    await prisma.attendanceLog.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Attendance log DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete log' }, { status: 500 })
  }
}
