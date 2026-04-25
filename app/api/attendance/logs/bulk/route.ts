import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const MAX_IDS = 200
const MAX_ABS_SHIFT_MINUTES = 10080 // 7 days

function withinOneSecond(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < 1000
}

function normalizePunchType(raw: string): 'in' | 'out' {
  const t = String(raw).toLowerCase().trim()
  return t === 'out' ? 'out' : 'in'
}

/**
 * POST /api/attendance/logs/bulk
 * Apply the same time shift and/or punch-type rule to many logs (non-extracted only).
 *
 * Body: { ids: string[], shiftMinutes?: number, setPunchType?: 'in' | 'out' | 'flip' }
 * At least one of shiftMinutes (non-zero) or setPunchType must be provided.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids: rawIds, shiftMinutes: rawShift, setPunchType: rawType } = body as {
      ids?: unknown
      shiftMinutes?: unknown
      setPunchType?: unknown
    }

    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    }
    if (rawIds.length > MAX_IDS) {
      return NextResponse.json({ error: `At most ${MAX_IDS} punches per request` }, { status: 400 })
    }

    const ids = [...new Set(rawIds.map((x) => String(x ?? '').trim()).filter(Boolean))]
    if (ids.length === 0) {
      return NextResponse.json({ error: 'No valid ids' }, { status: 400 })
    }

    let shiftMinutes: number | null = null
    if (rawShift !== undefined && rawShift !== null && rawShift !== '') {
      const n = typeof rawShift === 'number' ? rawShift : Number(rawShift)
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return NextResponse.json({ error: 'shiftMinutes must be a whole number of minutes' }, { status: 400 })
      }
      if (Math.abs(n) > MAX_ABS_SHIFT_MINUTES) {
        return NextResponse.json(
          { error: `shiftMinutes must be between -${MAX_ABS_SHIFT_MINUTES} and ${MAX_ABS_SHIFT_MINUTES}` },
          { status: 400 }
        )
      }
      shiftMinutes = n
    }

    let setPunchType: 'in' | 'out' | 'flip' | null = null
    if (rawType !== undefined && rawType !== null && rawType !== '') {
      const s = String(rawType).toLowerCase().trim()
      if (s !== 'in' && s !== 'out' && s !== 'flip') {
        return NextResponse.json({ error: 'setPunchType must be in, out, or flip' }, { status: 400 })
      }
      setPunchType = s as 'in' | 'out' | 'flip'
    }

    const hasShift = shiftMinutes !== null && shiftMinutes !== 0
    const hasType = setPunchType !== null
    if (!hasShift && !hasType) {
      return NextResponse.json(
        { error: 'Provide a non-zero shiftMinutes and/or setPunchType (in, out, or flip)' },
        { status: 400 }
      )
    }

    const logs = await prisma.attendanceLog.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        deviceUserId: true,
        punchTime: true,
        punchType: true,
        extractedAt: true
      }
    })

    if (logs.length !== ids.length) {
      return NextResponse.json({ error: 'One or more punch ids were not found' }, { status: 404 })
    }

    const extracted = logs.filter((l) => l.extractedAt != null)
    if (extracted.length > 0) {
      return NextResponse.json(
        { error: `${extracted.length} selected punch(es) are filed in a pay period and cannot be edited.` },
        { status: 409 }
      )
    }

    const batchIdSet = new Set(ids)
    const deltaMs = hasShift && shiftMinutes !== null ? shiftMinutes * 60 * 1000 : 0

    type FinalRow = { id: string; deviceUserId: string; oldTime: Date; newTime: Date; newType: 'in' | 'out' }
    const finals: FinalRow[] = []

    for (const log of logs) {
      const oldTime = log.punchTime
      const newTime = hasShift ? new Date(oldTime.getTime() + deltaMs) : oldTime
      if (isNaN(newTime.getTime())) {
        return NextResponse.json({ error: 'Invalid punch time after shift' }, { status: 400 })
      }

      const oldType = normalizePunchType(log.punchType)
      let newType = oldType
      if (setPunchType === 'in' || setPunchType === 'out') {
        newType = setPunchType
      } else if (setPunchType === 'flip') {
        newType = oldType === 'in' ? 'out' : 'in'
      }

      const timeChanged = newTime.getTime() !== oldTime.getTime()
      const typeChanged = newType !== oldType
      if (!timeChanged && !typeChanged) {
        continue
      }

      finals.push({ id: log.id, deviceUserId: log.deviceUserId, oldTime, newTime, newType })
    }

    if (finals.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No changes needed for the selected punches.' })
    }

    // In-batch: two selected punches must not land within 1s for the same device user.
    for (let i = 0; i < finals.length; i++) {
      for (let j = i + 1; j < finals.length; j++) {
        const a = finals[i]
        const b = finals[j]
        if (a.deviceUserId !== b.deviceUserId) continue
        if (withinOneSecond(a.newTime, b.newTime)) {
          return NextResponse.json(
            {
              error:
                'After applying changes, two selected punches for the same person would be within one second. Adjust the selection or shift amount.'
            },
            { status: 409 }
          )
        }
      }
    }

    // Against the rest of the database (rows not in this bulk selection), only when time moves.
    for (const f of finals) {
      if (f.newTime.getTime() === f.oldTime.getTime()) continue
      const clash = await prisma.attendanceLog.findFirst({
        where: {
          deviceUserId: f.deviceUserId,
          id: { notIn: [...batchIdSet] },
          punchTime: {
            gte: new Date(f.newTime.getTime() - 1000),
            lte: new Date(f.newTime.getTime() + 1000)
          }
        },
        select: { id: true }
      })
      if (clash) {
        return NextResponse.json(
          {
            error:
              'A punch already exists within one second of a new time for one of the selected rows. Change times individually or use a smaller shift.'
          },
          { status: 409 }
        )
      }
    }

    const now = new Date()
    await prisma.$transaction(
      finals.map((f) =>
        prisma.attendanceLog.update({
          where: { id: f.id },
          data: {
            punchTime: f.newTime,
            punchType: f.newType,
            correctedAt: now
          }
        })
      )
    )

    return NextResponse.json({ updated: finals.length })
  } catch (error) {
    console.error('Attendance bulk log POST error:', error)
    return NextResponse.json({ error: 'Failed to bulk-update logs' }, { status: 500 })
  }
}
