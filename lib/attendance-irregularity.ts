/**
 * Attendance punch-day status: valid in/out pairing plus count vs expected.
 * - full (green): count matches expected punches/day and pairing is valid
 * - short_ok (blue): exactly 2 punches, valid in→out pair, and expected > 2 (short shift vs full standard)
 * - irregular (red): bad pairing, unknown types, or count otherwise wrong
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

/** Per punch row — all punches on the same staff calendar day share one status. */
export type PunchDayStatus = 'full' | 'short_ok' | 'irregular'

export function parseExpectedPunchesPerDay(raw: string | null | undefined): number {
  const n = parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n) || n < MIN_EXPECTED) return DEFAULT_EXPECTED_PUNCHES
  return Math.min(MAX_EXPECTED, Math.max(MIN_EXPECTED, n))
}

/** Returns true if in/out sequence pairs completely (stack of opens empty at end). */
function pairingIsValid(arr: PunchForIrregularity[]): boolean {
  const sorted = [...arr].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())
  const openInIds: string[] = []
  for (const p of sorted) {
    const t = String(p.punchType ?? '').toLowerCase().trim()
    if (t === 'in') {
      openInIds.push(p.id)
    } else if (t === 'out') {
      if (openInIds.length === 0) return false
      openInIds.pop()
    } else {
      return false
    }
  }
  return openInIds.length === 0
}

/**
 * Maps each log id to its calendar-day status for that staff member.
 */
export function computeAttendancePunchDayStatuses(
  logs: PunchForIrregularity[],
  expectedPunchesPerDay: number
): Map<string, PunchDayStatus> {
  const result = new Map<string, PunchDayStatus>()
  const byStaffDate = new Map<string, PunchForIrregularity[]>()

  for (const log of logs) {
    const day = log.punchTime.toISOString().slice(0, 10)
    const key = `${log.staffId || log.deviceUserId}|${day}`
    if (!byStaffDate.has(key)) byStaffDate.set(key, [])
    byStaffDate.get(key)!.push(log)
  }

  for (const arr of byStaffDate.values()) {
    const n = arr.length
    let status: PunchDayStatus

    if (!pairingIsValid(arr)) {
      status = 'irregular'
    } else if (n === expectedPunchesPerDay) {
      status = 'full'
    } else if (n === 2 && expectedPunchesPerDay !== 2) {
      status = 'short_ok'
    } else {
      status = 'irregular'
    }

    for (const p of arr) {
      result.set(p.id, status)
    }
  }

  return result
}
