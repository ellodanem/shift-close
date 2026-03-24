import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * ZKTeco iClock / ADMS push protocol (HTTPS).
 * Standard paths: GET /iclock/getrequest, POST /iclock/cdata?table=ATTLOG
 * Legacy alias: /api/attendance/adms
 */

/** Resolve table= from query, form body, or infer ATTLOG from tab-separated punch lines. */
function resolveTableParam(request: NextRequest, bodyText: string): string {
  const sp = request.nextUrl.searchParams
  const fromQuery = sp.get('table') || sp.get('Table') || sp.get('TABLE')
  if (fromQuery) return fromQuery.toUpperCase()

  const ct = (request.headers.get('content-type') || '').toLowerCase()
  if (ct.includes('application/x-www-form-urlencoded') && bodyText.trim()) {
    try {
      const params = new URLSearchParams(bodyText)
      const t = params.get('table') || params.get('Table')
      if (t) return t.toUpperCase()
    } catch {
      // ignore
    }
  }

  // Some firmware omits table= but sends raw ATTLOG lines: PIN \t YYYY-MM-DD HH:MM:SS \t ...
  const first = bodyText.trim().split(/\r?\n/).find((l) => l.trim()) || ''
  if (/^\d+\t\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(first)) {
    return 'ATTLOG'
  }

  return ''
}

export async function zkPushGET(request: NextRequest) {
  const sn = request.nextUrl.searchParams.get('SN') || 'unknown'
  const path = request.nextUrl.pathname
  console.log(`[ADMS] GET ${path} SN=${sn}`)
  return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

export async function zkPushPOST(request: NextRequest) {
  const url = request.nextUrl
  const path = url.pathname
  const sn = url.searchParams.get('SN') || 'unknown'

  try {
    const body = await request.text()
    const table = resolveTableParam(request, body)

    console.log(`[ADMS] POST ${path} table=${table || '(none)'} SN=${sn} bytes=${body.length}`)

    if (table !== 'ATTLOG') {
      const preview = body.trim().slice(0, 120).replace(/\s+/g, ' ')
      console.log(
        `[ADMS] skip: need ATTLOG, got table=${table || 'empty'}. Body preview: ${preview || '(empty)'}`
      )
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    if (!body.trim()) {
      console.log('[ADMS] ATTLOG POST with empty body')
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    const allStaff = await prisma.staff.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, deviceUserId: true }
    })
    const staffMap = new Map<string, { id: string; name: string }>()
    for (const s of allStaff) {
      if (s.deviceUserId) staffMap.set(s.deviceUserId.trim(), { id: s.id, name: s.name })
    }

    const lines = body.trim().split(/\r?\n/)
    let created = 0

    const byUserDay = new Map<string, Array<{ deviceUserId: string; punchTime: Date; state: number }>>()

    const parsed: Array<{ deviceUserId: string; punchTime: Date; state: number }> = []

    for (const line of lines) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const deviceUserId = (parts[0] || '').trim()
      const timestampStr = (parts[1] || '').trim()
      const state = parseInt(parts[2] || '0', 10)

      if (!deviceUserId || !timestampStr) continue

      const punchTime = new Date(timestampStr)
      if (isNaN(punchTime.getTime())) continue

      parsed.push({ deviceUserId, punchTime, state })

      const dayKey = `${deviceUserId}|${punchTime.toISOString().slice(0, 10)}`
      if (!byUserDay.has(dayKey)) byUserDay.set(dayKey, [])
      byUserDay.get(dayKey)!.push({ deviceUserId, punchTime, state })
    }

    for (const arr of byUserDay.values()) {
      arr.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
    }

    for (const { deviceUserId, punchTime, state } of parsed) {
      let punchType: string
      if (state === 0 || state === 4) {
        punchType = 'in'
      } else if (state === 1 || state === 5) {
        punchType = 'out'
      } else {
        const dayKey = `${deviceUserId}|${punchTime.toISOString().slice(0, 10)}`
        const dayPunches = byUserDay.get(dayKey) || []
        const idx = dayPunches.findIndex(
          (p) => Math.abs(p.punchTime.getTime() - punchTime.getTime()) < 1000
        )
        punchType = idx % 2 === 0 ? 'in' : 'out'
      }

      const existing = await prisma.attendanceLog.findFirst({
        where: {
          deviceUserId,
          punchTime: {
            gte: new Date(punchTime.getTime() - 1000),
            lte: new Date(punchTime.getTime() + 1000)
          }
        }
      })
      if (existing) continue

      const staffMatch = staffMap.get(deviceUserId)
      await prisma.attendanceLog.create({
        data: {
          staffId: staffMatch?.id ?? null,
          deviceUserId,
          deviceUserName: staffMatch?.name ?? null,
          punchTime,
          punchType,
          source: `adms:${sn}`
        }
      })
      created++
    }

    console.log(`[ADMS] SN=${sn} processed ${parsed.length} records, created ${created} new`)
    return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  } catch (error) {
    console.error('[ADMS] Error:', error)
    return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
}
