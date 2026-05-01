import { prisma } from '@/lib/prisma'
import {
  detectBulkUpload,
  getAttendanceClockGlobalSettings,
  loadStationTz,
  maybeLearnDeviceClock,
  normalizePunchUtcForDevice,
  parseIncomingRecordTimeToUtc,
  serialAllowed
} from '@/lib/attendance-device-clock'

export type IngestLogLine = {
  deviceUserId: string
  recordTime: string | Date
  state?: number
}

/**
 * Shared pipeline for agent upload, LAN SDK sync, etc.
 * ADMS uses `zkPushPOST` directly. Learning is opt-in (typically ADMS-only).
 */
export async function ingestAttendanceBatch(params: {
  logs: IngestLogLine[]
  receivedAt: Date
  /** Resolved ZKTeco serial for clock baseline; null if unknown. */
  deviceSerial: string | null
  /** attendance_logs.source value e.g. agent | zkteco */
  source: string
  /** When true and exactly one parsed line and not bulk, update learned clock. */
  allowLearn: boolean
}): Promise<{ synced: number; total: number; bulk: boolean }> {
  const { logs, receivedAt, deviceSerial, source, allowLearn } = params

  const allStaff = await prisma.staff.findMany({
    where: { status: 'active' },
    select: { id: true, name: true, deviceUserId: true }
  })
  const staffMap = new Map<string, { id: string; name: string }>()
  for (const s of allStaff) {
    if (s.deviceUserId) staffMap.set(s.deviceUserId.trim(), { id: s.id, name: s.name })
  }

  const [stationTz, clockSettings] = await Promise.all([loadStationTz(), getAttendanceClockGlobalSettings()])
  const resolvedSerial =
    (deviceSerial ?? '').trim() || clockSettings.agentSerialFallback.trim() || ''

  type Row = {
    deviceUserId: string
    recordTimeRaw: string
    state?: number
    parsedUtc: Date
    parseFallback: boolean
  }

  const rows: Row[] = []
  for (const log of logs) {
    const deviceUserId = String(log.deviceUserId || '').trim()
    if (!deviceUserId) continue
    const parsed = parseIncomingRecordTimeToUtc(log.recordTime, stationTz)
    if (!parsed) continue
    const recordTimeRaw =
      log.recordTime instanceof Date ? log.recordTime.toISOString() : String(log.recordTime).trim()
    rows.push({
      deviceUserId,
      recordTimeRaw,
      state: log.state,
      parsedUtc: parsed.utc,
      parseFallback: parsed.usedFallback
    })
  }

  if (rows.length === 0) {
    return { synced: 0, total: 0, bulk: false }
  }

  const bulk = detectBulkUpload(
    rows.map((r) => r.parsedUtc),
    clockSettings
  )

  const eligibleLearn =
    allowLearn &&
    clockSettings.learn &&
    rows.length === 1 &&
    !bulk &&
    resolvedSerial.length > 0 &&
    resolvedSerial !== 'unknown' &&
    serialAllowed(resolvedSerial, clockSettings)

  if (eligibleLearn) {
    await maybeLearnDeviceClock({
      deviceSerial: resolvedSerial,
      receivedAt,
      deviceParsedUtc: rows[0]!.parsedUtc,
      bulk: false,
      settings: clockSettings,
      eligibleSingleLineLive: true
    })
  }

  const normalized = await Promise.all(
    rows.map(async (r) => {
      const norm = await normalizePunchUtcForDevice({
        deviceSerial: resolvedSerial || null,
        deviceParsedUtc: r.parsedUtc,
        settings: clockSettings
      })
      let reason = norm.reason
      if (r.parseFallback) reason = `${reason}_parse_fallback`
      return { ...r, punchUtc: norm.punchUtc, offsetMs: norm.offsetMsApplied, reason }
    })
  )

  const byUserDay = new Map<string, Array<{ deviceUserId: string; punchTime: Date; state?: number }>>()
  for (const r of normalized) {
    const dayKey = `${r.deviceUserId}|${r.punchUtc.toISOString().slice(0, 10)}`
    if (!byUserDay.has(dayKey)) byUserDay.set(dayKey, [])
    byUserDay.get(dayKey)!.push({ deviceUserId: r.deviceUserId, punchTime: r.punchUtc, state: r.state })
  }
  for (const arr of byUserDay.values()) {
    arr.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
  }

  let synced = 0
  for (const r of normalized) {
    const { deviceUserId, punchUtc, state, recordTimeRaw, offsetMs, reason } = r

    let punchType: string
    if (state === 0 || state === 4) {
      punchType = 'in'
    } else if (state === 1 || state === 5) {
      punchType = 'out'
    } else {
      const dayKey = `${deviceUserId}|${punchUtc.toISOString().slice(0, 10)}`
      const dayPunches = byUserDay.get(dayKey) || []
      const idx = dayPunches.findIndex((p) => Math.abs(p.punchTime.getTime() - punchUtc.getTime()) < 1000)
      punchType = idx % 2 === 0 ? 'in' : 'out'
    }

    const existing = await prisma.attendanceLog.findFirst({
      where: {
        deviceUserId,
        punchTime: {
          gte: new Date(punchUtc.getTime() - 1000),
          lte: new Date(punchUtc.getTime() + 1000)
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
        punchTime: punchUtc,
        punchType,
        source,
        deviceRawTimestamp: recordTimeRaw.slice(0, 80),
        deviceSerial: resolvedSerial.length > 0 && resolvedSerial !== 'unknown' ? resolvedSerial : null,
        ingestReceivedAt: receivedAt,
        clockOffsetMsApplied: offsetMs,
        clockNormalizeReason: reason
      }
    })
    synced++
  }

  return { synced, total: normalized.length, bulk }
}
