import type { RangeReport } from '@/lib/day-range-report'

/**
 * The mini report: only the Collected and Deposit tables for a range of days. No over/short or difference
 * figures, no sales, fuel, per-day detail or notes. This is all the stakeholder role is given, so the
 * stakeholder API returns this shape and nothing more.
 */
export type MiniRangeReport = {
  from: string
  to: string
  dayCount: number
  collected: { key: string; label: string; system: number; count: number; status: 'match' | 'differs' }[]
  deposit: { counted: number; deposited: number; status: 'match' | 'differs' }
}

export function toMiniReport(report: RangeReport): MiniRangeReport {
  return {
    from: report.from,
    to: report.to,
    dayCount: report.dayCount,
    collected: report.collected.map((l) => ({
      key: l.key,
      label: l.label,
      system: l.system,
      count: l.count,
      status: l.status
    })),
    deposit: {
      counted: report.deposit.counted,
      deposited: report.deposit.deposited,
      status: report.deposit.status
    }
  }
}
