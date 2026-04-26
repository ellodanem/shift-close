import { fromZonedTime } from 'date-fns-tz'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readStationTimeZone } from '@/lib/present-absence'

export const dynamic = 'force-dynamic'

const MAX_LINES = 64
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** + = clock in, − = clock out. Also accepts leading/trailing `in` / `out`. */
function parseBulkAddLine(trimmed: string): { punchType: 'in' | 'out'; timePart: string } | null {
  // Include ASCII hyphen-minus (U+002D); bulk UI emits `-` for clock-out.
  const m1 = /^([+\u2212\u2013\u2014-])\s*(.+)$/.exec(trimmed)
  if (m1) {
    const sym = m1[1]
    const timePart = m1[2].trim()
    if (!timePart) return null
    const isPlus = sym === '+'
    const isMinus = sym === '-' || sym === '\u2212' || sym === '\u2013' || sym === '\u2014'
    if (!isPlus && !isMinus) return null
    return { punchType: isPlus ? 'in' : 'out', timePart }
  }
  const m2 = /^(in|out)\s+(.+)$/i.exec(trimmed)
  if (m2) {
    return { punchType: m2[1].toLowerCase() === 'out' ? 'out' : 'in', timePart: m2[2].trim() }
  }
  const m3 = /^(.+?)\s+(in|out)$/i.exec(trimmed)
  if (m3) {
    return { punchType: m3[2].toLowerCase() === 'out' ? 'out' : 'in', timePart: m3[1].trim() }
  }
  return null
}

/**
 * Wall time on the given calendar date (interpreted later with station TZ).
 * 24-hour if no AM/PM (`09:00`, `17:30`). With meridiem: 12-hour (`9:00 AM`).
 */
function parseTimeOnDate(timePart: string): { hour: number; minute: number } | null {
  const s = timePart.trim().replace(/\s+/g, ' ')
  const mer = /\b(A\.?M\.?|P\.?M\.?)\s*$/i.exec(s)
  const core = mer ? s.slice(0, mer.index).trim() : s
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(core)
  if (!m) {
    const m2 = /^(\d{1,2})\s*(A\.?M\.?|P\.?M\.?)$/i.exec(s)
    if (!m2) return null
    let h = parseInt(m2[1], 10)
    const ap = m2[2].replace(/\./g, '').toUpperCase()
    const isPm = ap.startsWith('P')
    if (!Number.isFinite(h) || h < 1 || h > 12) return null
    if (h === 12) h = isPm ? 12 : 0
    else if (isPm) h += 12
    return { hour: h, minute: 0 }
  }
  let hour = parseInt(m[1], 10)
  const minute = parseInt(m[2], 10)
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null
  if (mer) {
    const ap = mer[1].replace(/\./g, '').toUpperCase()
    const isPm = ap.startsWith('P')
    if (hour < 1 || hour > 12) return null
    if (hour === 12) hour = isPm ? 12 : 0
    else if (isPm) hour += 12
  } else {
    if (hour < 0 || hour > 23) return null
  }
  return { hour, minute }
}

function instantOnCalendarDay(dateYmd: string, hour: number, minute: number, tz: string): Date {
  return fromZonedTime(`${dateYmd}T${pad2(hour)}:${pad2(minute)}:00`, tz)
}

/**
 * POST /api/attendance/logs/bulk-add
 * Preferred body: { staffId, entries: Array<{ date: 'YYYY-MM-DD', punchType: 'in'|'out', time: string }> }.
 * Legacy body also supported: { staffId, date: 'YYYY-MM-DD', text: string }.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { staffId: rawStaffId, date: rawDate, text: rawText, entries: rawEntries } = body as {
      staffId?: unknown
      date?: unknown
      text?: unknown
      entries?: unknown
    }

    const staffId = typeof rawStaffId === 'string' ? rawStaffId.trim() : ''
    if (!staffId) {
      return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
    }

    type InputLine = {
      n: number
      date: string
      raw: string
      punchType: 'in' | 'out'
      timePart: string
    }
    const lines: InputLine[] = []

    if (Array.isArray(rawEntries) && rawEntries.length > 0) {
      for (let i = 0; i < rawEntries.length; i++) {
        const n = i + 1
        const row = rawEntries[i]
        const rec = row && typeof row === 'object' ? (row as Record<string, unknown>) : null
        const date = typeof rec?.date === 'string' ? rec.date.trim() : ''
        const time = typeof rec?.time === 'string' ? rec.time.trim() : ''
        const ptRaw = typeof rec?.punchType === 'string' ? rec.punchType.toLowerCase().trim() : ''
        const punchType: 'in' | 'out' | null = ptRaw === 'in' || ptRaw === 'out' ? ptRaw : null
        if (!DATE_RE.test(date)) {
          return NextResponse.json({ error: `Line ${n}: date must be YYYY-MM-DD.` }, { status: 400 })
        }
        if (!time) {
          return NextResponse.json({ error: `Line ${n}: time is required.` }, { status: 400 })
        }
        if (!punchType) {
          return NextResponse.json({ error: `Line ${n}: punchType must be in or out.` }, { status: 400 })
        }
        lines.push({ n, date, raw: `${date} ${punchType} ${time}`, punchType, timePart: time })
      }
    } else {
      const date = typeof rawDate === 'string' ? rawDate.trim() : ''
      if (!DATE_RE.test(date)) {
        return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
      }
      const text = typeof rawText === 'string' ? rawText : ''
      const rawLines = text.split(/\r?\n/)
      for (let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i].trim()
        if (!raw || raw.startsWith('#')) continue
        const dir = parseBulkAddLine(raw)
        if (!dir) {
          return NextResponse.json(
            {
              error: `Line ${i + 1}: expected + or − (in/out) with a time, e.g. "+ 09:00" or "− 17:30". Got: ${raw.slice(0, 80)}`
            },
            { status: 400 }
          )
        }
        lines.push({ n: i + 1, date, raw, punchType: dir.punchType, timePart: dir.timePart })
      }
    }

    if (lines.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one line (or one entries row).' },
        { status: 400 }
      )
    }
    if (lines.length > MAX_LINES) {
      return NextResponse.json({ error: `At most ${MAX_LINES} punch lines per request` }, { status: 400 })
    }

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, name: true, deviceUserId: true }
    })
    if (!staff) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    }
    const deviceUserId = staff.deviceUserId?.trim()
    if (!deviceUserId) {
      return NextResponse.json(
        { error: 'Staff has no device user ID — map them on Device Management first' },
        { status: 400 }
      )
    }

    const tz = await readStationTimeZone()

    type Parsed = { lineNo: number; raw: string; punchType: 'in' | 'out'; instant: Date }
    const parsed: Parsed[] = []

    for (const { n, date, raw, punchType, timePart } of lines) {
      const hm = parseTimeOnDate(timePart)
      if (!hm) {
        return NextResponse.json(
          {
            error: `Line ${n}: could not parse time "${timePart}". Use 24-hour (17:30) or 12-hour with AM/PM (5:30 PM).`
          },
          { status: 400 }
        )
      }
      const instant = instantOnCalendarDay(date, hm.hour, hm.minute, tz)
      if (isNaN(instant.getTime())) {
        return NextResponse.json({ error: `Line ${n}: invalid date/time combination` }, { status: 400 })
      }
      parsed.push({ lineNo: n, raw, punchType, instant })
    }

    const sortedIdx = [...parsed.keys()].sort((a, b) => parsed[a].instant.getTime() - parsed[b].instant.getTime())
    for (let i = 0; i < sortedIdx.length; i++) {
      for (let j = i + 1; j < sortedIdx.length; j++) {
        const a = parsed[sortedIdx[i]]
        const b = parsed[sortedIdx[j]]
        if (Math.abs(a.instant.getTime() - b.instant.getTime()) < 1000) {
          return NextResponse.json(
            {
              error: `Lines ${a.lineNo} and ${b.lineNo}: times are within one second of each other — adjust one of them.`
            },
            { status: 409 }
          )
        }
      }
    }

    for (const p of parsed) {
      const clash = await prisma.attendanceLog.findFirst({
        where: {
          deviceUserId,
          punchTime: {
            gte: new Date(p.instant.getTime() - 1000),
            lte: new Date(p.instant.getTime() + 1000)
          }
        },
        select: { id: true }
      })
      if (clash) {
        return NextResponse.json(
          {
            error: `Line ${p.lineNo}: a punch already exists within one second of ${p.raw.trim()} for this staff.`
          },
          { status: 409 }
        )
      }
    }

    await prisma.$transaction(
      parsed.map((p) =>
        prisma.attendanceLog.create({
          data: {
            staffId: staff.id,
            deviceUserId,
            deviceUserName: staff.name,
            punchTime: p.instant,
            punchType: p.punchType,
            source: 'manual'
          }
        })
      )
    )

    return NextResponse.json({ created: parsed.length })
  } catch (error) {
    console.error('Attendance bulk-add POST error:', error)
    return NextResponse.json({ error: 'Failed to bulk-add punches' }, { status: 500 })
  }
}
