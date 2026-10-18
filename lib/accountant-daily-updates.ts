import { shiftSequenceRank } from '@/lib/shift-meter'

export const ACCOUNTANT_DAILY_REVIEWED_KEY = 'shift-close-accountant-daily-reviewed-v1'
export const ACCOUNTANT_DAILY_REVIEWED_EVENT = 'shift-close-accountant-daily-reviewed'

export type AccountantDailyShiftSource = {
  id: string
  date: string
  shift: string
  status: string
  deposits: string
  otherCredit: number
  systemDebit: number
  unleaded: number
  diesel: number
}

export type AccountantDailyLine = {
  shiftId: string
  shift: string
  amount: number
}

export type AccountantDailyUpdate = {
  date: string
  fingerprint: string
  shifts: Array<{ id: string; label: string; status: string }>
  deposits: AccountantDailyLine[]
  credits: AccountantDailyLine[]
  debits: AccountantDailyLine[]
  gasoline: number
  diesel: number
}

const AUTO_REVIEW_AFTER_DAYS = 3

export function isAccountantDailyUpdateOlderThan(
  date: string,
  days: number = AUTO_REVIEW_AFTER_DAYS,
  today: Date = new Date()
): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return false

  const [, year, month, day] = match
  const dateValue = Date.UTC(Number(year), Number(month) - 1, Number(day))
  const todayValue = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return (todayValue - dateValue) / 86_400_000 > days
}

export function autoReviewOlderAccountantDailyUpdates(
  days: AccountantDailyUpdate[],
  reviewed: Record<string, string>,
  today: Date = new Date()
): Record<string, string> {
  let next = reviewed
  for (const day of days) {
    if (isAccountantDailyUpdateOlderThan(day.date, AUTO_REVIEW_AFTER_DAYS, today) && reviewed[day.date] !== day.fingerprint) {
      if (next === reviewed) next = { ...reviewed }
      next[day.date] = day.fingerprint
    }
  }
  return next
}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100
}

function parseDeposits(value: string): number[] {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.map(Number).filter((amount) => Number.isFinite(amount) && amount > 0).map(round2)
  } catch {
    return []
  }
}

/** Small stable content hash used only to detect whether the accountant reviewed this version. */
function fingerprint(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function buildAccountantDailyUpdates(
  source: AccountantDailyShiftSource[]
): AccountantDailyUpdate[] {
  const byDate = new Map<string, AccountantDailyShiftSource[]>()
  for (const shift of source) {
    if (shift.status !== 'closed' && shift.status !== 'submitted') continue
    const rows = byDate.get(shift.date) ?? []
    rows.push(shift)
    byDate.set(shift.date, rows)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, unsorted]) => {
      const rows = [...unsorted].sort(
        (a, b) => shiftSequenceRank(a.shift) - shiftSequenceRank(b.shift) || a.shift.localeCompare(b.shift)
      )
      const deposits = rows.flatMap((row) =>
        parseDeposits(row.deposits).map((amount) => ({ shiftId: row.id, shift: row.shift, amount }))
      )
      const credits = rows
        .filter((row) => round2(row.otherCredit) !== 0)
        .map((row) => ({ shiftId: row.id, shift: row.shift, amount: round2(row.otherCredit) }))
      const debits = rows
        .filter((row) => round2(row.systemDebit) !== 0)
        .map((row) => ({ shiftId: row.id, shift: row.shift, amount: round2(row.systemDebit) }))
      const signature = rows.map((row) => ({
        id: row.id,
        shift: row.shift,
        status: row.status,
        deposits: parseDeposits(row.deposits),
        credit: round2(row.otherCredit),
        debit: round2(row.systemDebit),
        gasoline: round2(row.unleaded),
        diesel: round2(row.diesel)
      }))

      return {
        date,
        fingerprint: fingerprint(JSON.stringify(signature)),
        shifts: rows.map((row) => ({ id: row.id, label: row.shift, status: row.status })),
        deposits,
        credits,
        debits,
        gasoline: round2(rows.reduce((sum, row) => sum + (Number(row.unleaded) || 0), 0)),
        diesel: round2(rows.reduce((sum, row) => sum + (Number(row.diesel) || 0), 0))
      }
    })
}
