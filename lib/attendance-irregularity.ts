/**
 * Attendance punch-day status: valid in/out pairing plus count vs expected.
 * - full (green): count matches expected punches/day and pairing is valid
 * - short_ok (blue / “Possible missed” in UI): exactly 2 punches, valid in→out pair, and expected > 2
 * - irregular (red): bad pairing, unknown types, or count otherwise wrong
 *
 * Calendar day bucketing uses `getCalendarDayKey` (default: UTC). For UI that must match the
 * browser’s Date column, pass `localCalendarDayKey` so “same day” matches local wall time.
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

/** UTC date YYYY-MM-DD — used by API responses when no client recomputation runs. */
export function utcCalendarDayKey(punchTime: Date): string {
  return punchTime.toISOString().slice(0, 10)
}

/** Local calendar date YYYY-MM-DD (runtime timezone, e.g. browser) — aligns with typical date display. */
export function localCalendarDayKey(punchTime: Date): string {
  const y = punchTime.getFullYear()
  const m = String(punchTime.getMonth() + 1).padStart(2, '0')
  const day = String(punchTime.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
 * @param getCalendarDayKey - How to derive “which day” from `punchTime`. Default UTC (server/API).
 */
export function computeAttendancePunchDayStatuses(
  logs: PunchForIrregularity[],
  expectedPunchesPerDay: number,
  getCalendarDayKey: (punchTime: Date) => string = utcCalendarDayKey
): Map<string, PunchDayStatus> {
  const result = new Map<string, PunchDayStatus>()
  const byStaffDate = new Map<string, PunchForIrregularity[]>()

  for (const log of logs) {
    const day = getCalendarDayKey(log.punchTime)
    // Always bucket by device user so rows with/without staff_id still count as one person per day.
    const deviceKey = String(log.deviceUserId ?? '').trim() || String(log.staffId ?? '').trim() || 'unknown'
    const key = `${deviceKey}|${day}`
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
