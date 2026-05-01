import { NextRequest, NextResponse } from 'next/server'
import {
  deviceUserIdForGrouping,
  deviceUserIdLookupKeys
} from '@/lib/device-user-id'
import {
  detectBulkUpload,
  getAttendanceClockGlobalSettings,
  loadStationTz,
  maybeLearnDeviceClock,
  normalizePunchUtcForDevice,
  parseDeviceNaiveTimestampToUtc,
  serialAllowed
} from '@/lib/attendance-device-clock'
import { prisma } from '@/lib/prisma'

/**
 * ZKTeco iClock / ADMS push protocol (HTTPS).
 * Standard paths: GET /iclock/getrequest, POST /iclock/cdata?table=ATTLOG
 * Legacy alias: /api/attendance/adms
 */

/** One ATTLOG line: PIN \\t YYYY-MM-DD HH:MM:SS ... (firmware varies slightly on time format). */
function lineLooksLikeAttLog(line: string): boolean {
  return /^\d+\t\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(line.trim())
}

function bodyHasAttLogLines(bodyText: string): boolean {
  for (const line of bodyText.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (lineLooksLikeAttLog(line)) return true
  }
  return false
}

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

  const first = bodyText.trim().split(/\r?\n/).find((l) => l.trim()) || ''
  if (lineLooksLikeAttLog(first)) {
    return 'ATTLOG'
  }

  return ''
}

type StaffMatch = { id: string; name: string; deviceUserId: string }

function buildStaffMap(
  allStaff: Array<{ id: string; name: string; deviceUserId: string | null }>
): Map<string, StaffMatch> {
  const staffMap = new Map<string, StaffMatch>()
  for (const s of allStaff) {
    if (!s.deviceUserId?.trim()) continue
    const canon = s.deviceUserId.trim()
    const payload: StaffMatch = { id: s.id, name: s.name, deviceUserId: canon }
    for (const k of deviceUserIdLookupKeys(canon)) {
      staffMap.set(k, payload)
    }
  }
  return staffMap
}

function lookupStaff(staffMap: Map<string, StaffMatch>, rawFromLine: string): StaffMatch | undefined {
  for (const k of deviceUserIdLookupKeys(rawFromLine)) {
    const m = staffMap.get(k)
    if (m) return m
  }
  return undefined
}

type ParsedRow = {
  deviceUserId: string
  timestampStr: string
  state: number
  parsedUtc: Date
  parseFallback: boolean
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
  const snRaw = url.searchParams.get('SN') || 'unknown'
  const sn = snRaw.trim()

  try {
    const body = await request.text()
    let table = resolveTableParam(request, body)
    const declaredTable = table

    if (table !== 'ATTLOG' && bodyHasAttLogLines(body)) {
      console.log(
        `[ADMS] body contains ATTLOG-shaped lines; processing as ATTLOG (declared table=${declaredTable || 'empty'}) SN=${sn}`
      )
      table = 'ATTLOG'
    }

    console.log(`[ADMS] POST ${path} table=${table || '(none)'} SN=${sn} bytes=${body.length}`)

    if (table !== 'ATTLOG') {
      const preview = body.trim().slice(0, 120).replace(/\s+/g, ' ')
      console.log(
        `[ADMS] skip: need attendance punches (ATTLOG). Declared table=${declaredTable || 'empty'}. ` +
          `OPERLOG/BIODATA are not stored. Enable real-time upload for Attendance/ATTLOG on the device. ` +
          `Preview: ${preview || '(empty)'}`
      )
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    if (!body.trim()) {
      console.log('[ADMS] ATTLOG POST with empty body')
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    const receivedAt = new Date()
    const [stationTz, clockSettings] = await Promise.all([loadStationTz(), getAttendanceClockGlobalSettings()])

    const allStaff = await prisma.staff.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, deviceUserId: true }
    })
    const staffMap = buildStaffMap(allStaff)

    const lines = body.trim().split(/\r?\n/)
    const rawParsed: ParsedRow[] = []

    for (const line of lines) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const deviceUserId = (parts[0] || '').trim()
      const timestampStr = (parts[1] || '').trim()
      const state = parseInt(parts[2] || '0', 10)

      if (!deviceUserId || !timestampStr) continue

      let parsedUtc = parseDeviceNaiveTimestampToUtc(timestampStr, stationTz)
      let parseFallback = false
      if (!parsedUtc) {
        const d = new Date(timestampStr)
        if (isNaN(d.getTime())) continue
        parsedUtc = d
        parseFallback = true
      }

      rawParsed.push({ deviceUserId, timestampStr, state, parsedUtc, parseFallback })
    }

    if (rawParsed.length === 0) {
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    const bulk = detectBulkUpload(
      rawParsed.map((r) => r.parsedUtc),
      clockSettings
    )

    const eligibleSingleLineLive =
      rawParsed.length === 1 &&
      !bulk &&
      sn !== 'unknown' &&
      serialAllowed(sn, clockSettings) &&
      clockSettings.learn

    if (eligibleSingleLineLive) {
      await maybeLearnDeviceClock({
        deviceSerial: sn,
        receivedAt,
        deviceParsedUtc: rawParsed[0]!.parsedUtc,
        bulk: false,
        settings: clockSettings,
        eligibleSingleLineLive: true
      })
    }

    const normalized = await Promise.all(
      rawParsed.map(async (r) => {
        const norm = await normalizePunchUtcForDevice({
          deviceSerial: sn,
          deviceParsedUtc: r.parsedUtc,
          settings: clockSettings
        })
        let reason = norm.reason
        if (r.parseFallback) reason = `${reason}_parse_fallback`
        return {
          deviceUserId: r.deviceUserId,
          timestampStr: r.timestampStr,
          state: r.state,
          parsedUtc: r.parsedUtc,
          punchUtc: norm.punchUtc,
          offsetMs: norm.offsetMsApplied,
          reason
        }
      })
    )

    const byUserDay = new Map<string, Array<{ deviceUserId: string; punchTime: Date; state: number }>>()

    for (const row of normalized) {
      const punchTime = row.punchUtc
      const dayKey = `${deviceUserIdForGrouping(row.deviceUserId)}|${punchTime.toISOString().slice(0, 10)}`
      if (!byUserDay.has(dayKey)) byUserDay.set(dayKey, [])
      byUserDay.get(dayKey)!.push({ deviceUserId: row.deviceUserId, punchTime, state: row.state })
    }

    for (const arr of byUserDay.values()) {
      arr.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
    }

    let created = 0
    for (const row of normalized) {
      const { deviceUserId, punchUtc, state, timestampStr, offsetMs, reason } = row

      let punchType: string
      if (state === 0 || state === 4) {
        punchType = 'in'
      } else if (state === 1 || state === 5) {
        punchType = 'out'
      } else {
        const dayKey = `${deviceUserIdForGrouping(deviceUserId)}|${punchUtc.toISOString().slice(0, 10)}`
        const dayPunches = byUserDay.get(dayKey) || []
        const idx = dayPunches.findIndex((p) => Math.abs(p.punchTime.getTime() - punchUtc.getTime()) < 1000)
        punchType = idx % 2 === 0 ? 'in' : 'out'
      }

      const staffMatch = lookupStaff(staffMap, deviceUserId)
      const keysForDup = new Set([
        ...deviceUserIdLookupKeys(deviceUserId),
        ...(staffMatch ? deviceUserIdLookupKeys(staffMatch.deviceUserId) : [])
      ])
      const existing = await prisma.attendanceLog.findFirst({
        where: {
          deviceUserId: { in: [...keysForDup] },
          punchTime: {
            gte: new Date(punchUtc.getTime() - 1000),
            lte: new Date(punchUtc.getTime() + 1000)
          }
        }
      })
      if (existing) continue

      const logDeviceUserId = staffMatch?.deviceUserId ?? deviceUserId.trim()
      if (!staffMatch) {
        console.log(
          `[ADMS] unmapped device user id (no active staff match for normalized keys ${JSON.stringify([...keysForDup])}) SN=${sn}`
        )
      }

      await prisma.attendanceLog.create({
        data: {
          staffId: staffMatch?.id ?? null,
          deviceUserId: logDeviceUserId,
          deviceUserName: staffMatch?.name ?? null,
          punchTime: punchUtc,
          punchType,
          source: `adms:${sn}`,
          deviceRawTimestamp: timestampStr,
          deviceSerial: sn !== 'unknown' ? sn : null,
          ingestReceivedAt: receivedAt,
          clockOffsetMsApplied: offsetMs,
          clockNormalizeReason: reason
        }
      })
      created++
    }

    console.log(
      `[ADMS] SN=${sn} processed ${normalized.length} records, created ${created} new, bulk=${bulk ? '1' : '0'}`
    )
    return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  } catch (error) {
    console.error('[ADMS] Error:', error)
    return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
}
