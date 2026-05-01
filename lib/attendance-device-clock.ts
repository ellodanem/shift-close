import { fromZonedTime } from 'date-fns-tz'
import { prisma } from '@/lib/prisma'
import { readStationTimeZone } from '@/lib/present-absence'

/** Global toggles and thresholds (AppSettings keys). */
export const CLOCK_APPLY_KEY = 'attendance_clock_normalize_apply'
export const CLOCK_LEARN_KEY = 'attendance_clock_normalize_learn'
export const CLOCK_MIN_SAMPLES_KEY = 'attendance_clock_min_samples'
export const CLOCK_SPREAD_MAX_MIN_KEY = 'attendance_clock_delta_spread_max_minutes'
export const CLOCK_BULK_LINES_KEY = 'attendance_clock_bulk_line_threshold'
export const CLOCK_BULK_SPAN_MIN_KEY = 'attendance_clock_bulk_time_span_minutes'
export const CLOCK_ALLOWED_SERIALS_KEY = 'attendance_clock_allowed_serials'
export const CLOCK_AGENT_SERIAL_KEY = 'attendance_clock_device_serial_for_agent'
export const CLOCK_PENDING_MAX_KEY = 'attendance_clock_pending_max'
export const CLOCK_MAX_DELTA_ABS_MIN_KEY = 'attendance_clock_max_sample_delta_abs_minutes'

export type AttendanceClockGlobalSettings = {
  apply: boolean
  learn: boolean
  minSamples: number
  spreadMaxMinutes: number
  bulkLineThreshold: number
  bulkSpanMinutes: number
  allowedSerials: string[] // empty = allow all
  agentSerialFallback: string
  pendingMax: number
  maxSampleDeltaAbsMinutes: number
}

const NAIVE_DEVICE_TS = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/

/** Parse ZKTeco ATTLOG-style naive local time as an instant in `stationTz`. */
export function parseDeviceNaiveTimestampToUtc(timestampStr: string, stationTz: string): Date | null {
  const s = timestampStr.trim()
  const m = NAIVE_DEVICE_TS.exec(s)
  if (!m) return null
  const [, ymd, hh, mm, ss, frac] = m
  const h2 = hh.padStart(2, '0')
  const ms = frac ? parseInt((frac + '000').slice(0, 3), 10) : 0
  const localIso = `${ymd}T${h2}:${mm}:${ss}.${String(ms).padStart(3, '0')}`
  try {
    return fromZonedTime(localIso, stationTz)
  } catch {
    return null
  }
}

/** Agent / SDK may send ISO; otherwise treat as naive station time if it matches pattern. */
export function parseIncomingRecordTimeToUtc(
  recordTime: string | Date,
  stationTz: string
): { utc: Date; usedFallback: boolean } | null {
  if (recordTime instanceof Date) {
    if (Number.isNaN(recordTime.getTime())) return null
    return { utc: recordTime, usedFallback: false }
  }
  const s = String(recordTime ?? '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /Z$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    return { utc: d, usedFallback: false }
  }
  const naive = parseDeviceNaiveTimestampToUtc(s, stationTz)
  if (naive) return { utc: naive, usedFallback: false }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return { utc: d, usedFallback: true }
}

function parseBool(v: string | undefined, def: boolean): boolean {
  if (v == null || v === '') return def
  return v === 'true' || v === '1'
}

function parseIntF(v: string | undefined, def: number, min: number, max: number): number {
  const n = parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, n))
}

export async function getAttendanceClockGlobalSettings(): Promise<AttendanceClockGlobalSettings> {
  const keys = [
    CLOCK_APPLY_KEY,
    CLOCK_LEARN_KEY,
    CLOCK_MIN_SAMPLES_KEY,
    CLOCK_SPREAD_MAX_MIN_KEY,
    CLOCK_BULK_LINES_KEY,
    CLOCK_BULK_SPAN_MIN_KEY,
    CLOCK_ALLOWED_SERIALS_KEY,
    CLOCK_AGENT_SERIAL_KEY,
    CLOCK_PENDING_MAX_KEY,
    CLOCK_MAX_DELTA_ABS_MIN_KEY
  ]
  const rows = await prisma.appSettings.findMany({ where: { key: { in: keys } } })
  const m = new Map(rows.map((r) => [r.key, r.value]))
  const allowedRaw = (m.get(CLOCK_ALLOWED_SERIALS_KEY) ?? '').trim()
  const allowedSerials = allowedRaw
    ? allowedRaw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : []
  return {
    apply: parseBool(m.get(CLOCK_APPLY_KEY), true),
    learn: parseBool(m.get(CLOCK_LEARN_KEY), true),
    minSamples: parseIntF(m.get(CLOCK_MIN_SAMPLES_KEY), 5, 2, 30),
    spreadMaxMinutes: parseIntF(m.get(CLOCK_SPREAD_MAX_MIN_KEY), 20, 1, 180),
    bulkLineThreshold: parseIntF(m.get(CLOCK_BULK_LINES_KEY), 8, 1, 500),
    bulkSpanMinutes: parseIntF(m.get(CLOCK_BULK_SPAN_MIN_KEY), 120, 5, 24 * 60),
    allowedSerials,
    agentSerialFallback: (m.get(CLOCK_AGENT_SERIAL_KEY) ?? '').trim(),
    pendingMax: parseIntF(m.get(CLOCK_PENDING_MAX_KEY), 12, 5, 50),
    maxSampleDeltaAbsMinutes: parseIntF(m.get(CLOCK_MAX_DELTA_ABS_MIN_KEY), 18 * 60, 30, 48 * 60)
  }
}

export function serialAllowed(serial: string, settings: AttendanceClockGlobalSettings): boolean {
  const s = serial.trim()
  if (!s || s === 'unknown') return false
  if (settings.allowedSerials.length === 0) return true
  return settings.allowedSerials.includes(s)
}

export function detectBulkUpload(parsedUtc: Date[], settings: AttendanceClockGlobalSettings): boolean {
  if (parsedUtc.length >= settings.bulkLineThreshold) return true
  if (parsedUtc.length < 2) return false
  let minT = parsedUtc[0]!.getTime()
  let maxT = minT
  for (const d of parsedUtc) {
    const t = d.getTime()
    if (t < minT) minT = t
    if (t > maxT) maxT = t
  }
  const spanMin = (maxT - minT) / 60000
  return spanMin > settings.bulkSpanMinutes
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  if (s.length % 2 === 1) return s[mid]!
  return (s[mid - 1]! + s[mid]!) / 2
}

/** After a live single-line ADMS punch, append delta sample and maybe commit offset. */
export async function maybeLearnDeviceClock(params: {
  deviceSerial: string
  receivedAt: Date
  deviceParsedUtc: Date
  bulk: boolean
  settings: AttendanceClockGlobalSettings
  /** Only one ATTLOG line in this request — never learn from multi-line / backlog bursts. */
  eligibleSingleLineLive: boolean
}): Promise<void> {
  const { deviceSerial, receivedAt, deviceParsedUtc, bulk, settings, eligibleSingleLineLive } = params
  if (!eligibleSingleLineLive || !settings.learn || bulk) return
  if (!serialAllowed(deviceSerial, settings)) return

  const deltaMin = (receivedAt.getTime() - deviceParsedUtc.getTime()) / 60000
  if (!Number.isFinite(deltaMin)) return
  if (Math.abs(deltaMin) > settings.maxSampleDeltaAbsMinutes) return

  await prisma.$transaction(async (tx) => {
    const row = await tx.attendanceDeviceClock.findUnique({
      where: { deviceSerial }
    })
    let safePending: number[] = []
    if (row?.pendingDeltasJson) {
      try {
        const parsed = JSON.parse(row.pendingDeltasJson) as unknown
        if (Array.isArray(parsed)) {
          safePending = parsed.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
        }
      } catch {
        safePending = []
      }
    }

    safePending.push(deltaMin)
    while (safePending.length > settings.pendingMax) safePending.shift()

    let offsetMs = row?.offsetMs ?? 0
    let isCalibrated = row?.isCalibrated ?? false
    let calibrationSamples = row?.calibrationSamples ?? 0

    if (safePending.length >= settings.minSamples) {
      const lo = Math.min(...safePending)
      const hi = Math.max(...safePending)
      if (hi - lo <= settings.spreadMaxMinutes) {
        const medMin = median(safePending)
        offsetMs = Math.round(medMin * 60000)
        isCalibrated = true
        calibrationSamples = safePending.length
        safePending.length = 0
      }
    }

    await tx.attendanceDeviceClock.upsert({
      where: { deviceSerial },
      create: {
        deviceSerial,
        offsetMs,
        isCalibrated,
        pendingDeltasJson: JSON.stringify(safePending),
        calibrationSamples
      },
      update: {
        offsetMs,
        isCalibrated,
        pendingDeltasJson: JSON.stringify(safePending),
        calibrationSamples
      }
    })
  })
}

export type NormalizePunchUtcResult = {
  punchUtc: Date
  offsetMsApplied: number
  reason: string
}

export async function normalizePunchUtcForDevice(params: {
  deviceSerial: string | null
  deviceParsedUtc: Date
  settings: AttendanceClockGlobalSettings
}): Promise<NormalizePunchUtcResult> {
  const { deviceParsedUtc, settings } = params
  let serial = (params.deviceSerial ?? '').trim()
  if (!serial || serial === 'unknown') {
    if (settings.agentSerialFallback) serial = settings.agentSerialFallback.trim()
  }
  if (!settings.apply) {
    return { punchUtc: deviceParsedUtc, offsetMsApplied: 0, reason: 'apply_disabled' }
  }
  if (!serial || serial === 'unknown') {
    return { punchUtc: deviceParsedUtc, offsetMsApplied: 0, reason: 'no_serial' }
  }

  const row = await prisma.attendanceDeviceClock.findUnique({
    where: { deviceSerial: serial }
  })
  if (!row || !row.isCalibrated) {
    return { punchUtc: deviceParsedUtc, offsetMsApplied: 0, reason: 'warmup' }
  }

  const applied = row.offsetMs
  return {
    punchUtc: new Date(deviceParsedUtc.getTime() + applied),
    offsetMsApplied: applied,
    reason: 'learned_offset'
  }
}

export async function loadStationTz(): Promise<string> {
  return readStationTimeZone()
}
