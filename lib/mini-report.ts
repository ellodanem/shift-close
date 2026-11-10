import { round2 } from '@/lib/day-reconcile'
import { buildRangeReport } from '@/lib/day-range-report'
import type { DayReportV2 } from '@/lib/day-reports-v2'

/**
 * The mini report (EOD Report): what was taken in card / electronic, fleet and vouchers over a range of days,
 * laid out like the Components card on the Expected revenue page, plus the Deposit line (counted against
 * deposited). No over/short, sales, fuel, per-day detail or notes. This is all the stakeholder role is given,
 * so the stakeholder API returns this shape and nothing more.
 */
export type MiniRangeReport = {
  from: string
  to: string
  dayCount: number
  /** Card / electronic: the shifts' System Debit plus the Credit entered under Other Items. */
  card: { total: number; debit: number; credit: number }
  /** In-house (customer accounts): the shifts' System In-house. */
  inhouse: number
  fleet: number
  /** Vouchers / coupons (Massy). */
  vouchers: number
  deposit: { counted: number; deposited: number; status: 'match' | 'differs' }
}

/** 2026-11-06 to 06-11-2026 (DD-MM-YYYY). Anything that is not YYYY-MM-DD is returned unchanged. */
export function formatDmy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ymd
}

/** Build the mini report from End of Day V2 days (at least one). */
export function buildMiniReport(days: DayReportV2[]): MiniRangeReport {
  const range = buildRangeReport(days)
  let debit = 0
  let credit = 0
  let inhouse = 0
  let fleet = 0
  let vouchers = 0
  for (const day of days) {
    for (const s of day.shifts) {
      debit += s.systemDebit || 0
      credit += s.otherCredit || 0
      inhouse += s.systemInhouse || 0
      fleet += s.systemFleet || 0
      vouchers += s.systemMassyCoupons || 0
    }
  }
  return {
    from: range.from,
    to: range.to,
    dayCount: range.dayCount,
    card: { total: round2(debit + credit), debit: round2(debit), credit: round2(credit) },
    inhouse: round2(inhouse),
    fleet: round2(fleet),
    vouchers: round2(vouchers),
    deposit: {
      counted: range.deposit.counted,
      deposited: range.deposit.deposited,
      status: range.deposit.status
    }
  }
}
