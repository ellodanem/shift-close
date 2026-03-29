/**
 * Attendance irregularity rules: sequential In/Out pairing per staff per calendar day,
 * plus optional expected punch count per day (default 4 = two in/out pairs for a standard full day).
 */

const DEFAULT_EXPECTED_PUNCHES = 4
const MIN_EXPECTED = 1
const MAX_EXPECTED = 24

export type PunchForIrregularity = {
  id: string
  staffId: string | null
  deviceUserId: string
  punchTime: Date
  punchType: string
}

export function parseExpectedPunchesPerDay(raw: string | null | undefined): number {
  const n = parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n) || n < MIN_EXPECTED) return DEFAULT_EXPECTED_PUNCHES
  return Math.min(MAX_EXPECTED, Math.max(MIN_EXPECTED, n))
}

/**
 * Returns log IDs that are irregular: unmatched in/out sequence and/or punch count for that day
 * not equal to `expectedPunchesPerDay`.
 */
export function computeAttendanceIrregularityIds(
  logs: PunchForIrregularity[],
  expectedPunchesPerDay: number
): Set<string> {
  const irregularityIds = new Set<string>()
  const byStaffDate = new Map<string, PunchForIrregularity[]>()

  for (const log of logs) {
    const day = log.punchTime.toISOString().slice(0, 10)
    const key = `${log.staffId || log.deviceUserId}|${day}`
    if (!byStaffDate.has(key)) byStaffDate.set(key, [])
    byStaffDate.get(key)!.push(log)
  }

  for (const arr of byStaffDate.values()) {
    arr.sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())

    const openInIds: string[] = []
    for (const p of arr) {
      const t = String(p.punchType ?? '').toLowerCase().trim()
      if (t === 'in') {
        openInIds.push(p.id)
      } else if (t === 'out') {
        if (openInIds.length === 0) {
          irregularityIds.add(p.id)
        } else {
          openInIds.pop()
        }
      } else {
        irregularityIds.add(p.id)
      }
    }
    for (const id of openInIds) {
      irregularityIds.add(id)
    }

    if (arr.length !== expectedPunchesPerDay) {
      for (const p of arr) {
        irregularityIds.add(p.id)
      }
    }
  }

  return irregularityIds
}
