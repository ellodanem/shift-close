import type { Prisma } from '@prisma/client'
import { deviceUserIdLookupKeys, expandDeviceUserIdsForDbMatch } from '@/lib/device-user-id'
import { prisma } from '@/lib/prisma'

const DEDUPE_WINDOW_MS = 1000
const CREATE_MANY_CHUNK = 250

export type AttendancePunchInsert = {
  staffId: string | null
  deviceUserId: string
  deviceUserName: string | null
  punchTime: Date
  punchType: string
  source: string
  deviceRawTimestamp?: string | null
  deviceSerial?: string | null
  ingestReceivedAt?: Date | null
  clockOffsetMsApplied?: number | null
  clockNormalizeReason?: string | null
}

function deviceIdsOverlap(a: string, b: string): boolean {
  const keysA = new Set(deviceUserIdLookupKeys(a))
  for (const k of deviceUserIdLookupKeys(b)) {
    if (keysA.has(k)) return true
  }
  return false
}

function punchTimesOverlap(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= DEDUPE_WINDOW_MS
}

function isDuplicatePunch(
  candidate: { deviceUserId: string; punchTime: Date },
  other: { deviceUserId: string; punchTime: Date }
): boolean {
  return deviceIdsOverlap(candidate.deviceUserId, other.deviceUserId) && punchTimesOverlap(candidate.punchTime, other.punchTime)
}

function collectLookupDeviceUserIds(rows: AttendancePunchInsert[]): string[] {
  const ids: string[] = []
  for (const row of rows) {
    ids.push(row.deviceUserId)
  }
  return expandDeviceUserIdsForDbMatch(ids)
}

/**
 * Insert punches in bulk, skipping rows that match an existing punch (±1s, device id variants)
 * or an earlier row in the same batch.
 */
export async function insertAttendancePunchesSkippingDuplicates(
  rows: AttendancePunchInsert[]
): Promise<{ created: number; skipped: number }> {
  if (rows.length === 0) return { created: 0, skipped: 0 }

  let minMs = Infinity
  let maxMs = -Infinity
  for (const row of rows) {
    const t = row.punchTime.getTime()
    if (t < minMs) minMs = t
    if (t > maxMs) maxMs = t
  }

  const lookupIds = collectLookupDeviceUserIds(rows)
  const existing = await prisma.attendanceLog.findMany({
    where: {
      deviceUserId: { in: lookupIds },
      punchTime: {
        gte: new Date(minMs - DEDUPE_WINDOW_MS),
        lte: new Date(maxMs + DEDUPE_WINDOW_MS)
      }
    },
    select: { deviceUserId: true, punchTime: true }
  })

  const seen: Array<{ deviceUserId: string; punchTime: Date }> = [...existing]
  const toCreate: Prisma.AttendanceLogCreateManyInput[] = []
  let skipped = 0

  for (const row of rows) {
    const candidate = { deviceUserId: row.deviceUserId, punchTime: row.punchTime }
    if (seen.some((p) => isDuplicatePunch(candidate, p))) {
      skipped++
      continue
    }
    toCreate.push(row)
    seen.push(candidate)
  }

  if (toCreate.length === 0) return { created: 0, skipped }

  let created = 0
  for (let i = 0; i < toCreate.length; i += CREATE_MANY_CHUNK) {
    const chunk = toCreate.slice(i, i + CREATE_MANY_CHUNK)
    const result = await prisma.attendanceLog.createMany({ data: chunk })
    created += result.count
  }

  return { created, skipped }
}
