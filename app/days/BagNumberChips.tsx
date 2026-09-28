import type { DayReport } from '@/lib/types'

export function uniqueDayBagNumbers(dayReport: DayReport): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const shift of dayReport.shifts) {
    for (const raw of shift.depositBagNumbers ?? []) {
      const bag = String(raw).trim()
      if (!bag || seen.has(bag)) continue
      seen.add(bag)
      out.push(bag)
    }
  }
  return out
}

export function BagNumberChips({ bags }: { bags: string[] }) {
  if (bags.length === 0) return null
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
      <span className="text-[11px] font-medium text-slate-400">Bags</span>
      {bags.map((bag) => (
        <span
          key={bag}
          className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700"
          title={`Night deposit bag ${bag}`}
        >
          {bag}
        </span>
      ))}
    </span>
  )
}
