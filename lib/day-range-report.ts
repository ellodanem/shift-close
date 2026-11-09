import { OVER_SHORT_LOOK_THRESHOLD, round2, type DayReconcile } from '@/lib/day-reconcile'

/** The part of an End of Day V2 day that the range report needs. */
export type RangeDayInput = {
  date: string
  reconcile: DayReconcile
}

export type RangeSalesLine = { key: string; label: string; amount: number }
export type RangeLitresLine = { key: string; label: string; litres: number }

export type RangeCollectedLine = {
  key: string
  label: string
  system: number
  count: number
  /** Count minus System over the range. */
  overShort: number
  status: 'match' | 'differs'
}

export type RangeByDay = {
  date: string
  cashOverShort: number
  creditOverShort: number
  /** Deposited minus counted. */
  depositDiff: number
  depositStatus: 'match' | 'differs'
  differenceCount: number
  /** "All match" or "N differences". */
  verdictText: string
}

export type RangeReport = {
  from: string
  to: string
  dayCount: number
  /** Days that had a Cstore daily report; sales and fuel only cover these. */
  cstoreDayCount: number
  missingCstoreDates: string[]
  sales: { lines: RangeSalesLine[]; totalSales: number }
  fuel: RangeLitresLine[]
  collected: RangeCollectedLine[]
  /** The Cash + Checks line. */
  cashChecks: RangeCollectedLine
  deposit: { counted: number; deposited: number; diff: number; status: 'match' | 'differs' }
  byDay: RangeByDay[]
  notes: string[]
}

const COLLECTED_KEYS: Array<{ key: string; label: string }> = [
  { key: 'cashChecks', label: 'Cash + Checks' },
  { key: 'credits', label: 'Credit/Debit' },
  { key: 'inhouse', label: 'In-House' },
  { key: 'fleets', label: 'Fleets' },
  { key: 'massy', label: 'Massy Coupons' }
]

const SALES_KEYS: Array<{ key: string; label: string }> = [
  { key: 'grocery', label: 'Grocery' },
  { key: 'salesTax', label: 'Sales tax' },
  { key: 'regularAmt', label: 'Regular' },
  { key: 'dieselAmt', label: 'Diesel' },
  { key: 'payIn', label: 'Customer account pay-in' }
]

const FUEL_KEYS: Array<{ key: string; label: string }> = [
  { key: 'regularLitres', label: 'Regular sold' },
  { key: 'dieselLitres', label: 'Diesel sold' }
]

const TOLERANCE = 0.005

function money(n: number, sign = false): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : sign && n > 0 ? '+' : ''}$${abs}`
}

function shortDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * Add up the End of Day V2 figures of the given days into one statement. Every figure is a plain sum
 * of the day figures, so the range always agrees with the days it is built from.
 */
export function buildRangeReport(input: RangeDayInput[]): RangeReport {
  const days = [...input].sort((a, b) => (a.date < b.date ? -1 : 1))
  const withCstore = days.filter((d) => d.reconcile.hasCstore)

  const sumSales = (key: string): number =>
    round2(
      withCstore.reduce((t, d) => t + (d.reconcile.sales.lines.find((l) => l.key === key)?.cstore ?? 0), 0)
    )

  const salesLines: RangeSalesLine[] = SALES_KEYS.map((k) => ({ ...k, amount: sumSales(k.key) })).filter(
    (l) => l.key !== 'payIn' || Math.abs(l.amount) >= TOLERANCE
  )
  const totalSales = round2(withCstore.reduce((t, d) => t + (d.reconcile.sales.totalSales ?? 0), 0))
  const fuel: RangeLitresLine[] = FUEL_KEYS.map((k) => ({
    ...k,
    litres: Math.round(sumSales(k.key) * 10) / 10
  }))

  const collected: RangeCollectedLine[] = COLLECTED_KEYS.map(({ key, label }) => {
    let system = 0
    let count = 0
    for (const d of days) {
      const l = d.reconcile.collected.lines.find((x) => x.key === key)
      if (l) {
        system += l.system
        count += l.count
      }
    }
    const overShort = round2(count - system)
    return {
      key,
      label,
      system: round2(system),
      count: round2(count),
      overShort,
      status: Math.abs(overShort) < TOLERANCE ? ('match' as const) : ('differs' as const)
    }
  }).filter((l) => l.key !== 'massy' || Math.abs(l.system) + Math.abs(l.count) >= TOLERANCE)

  const cashChecks = collected[0]

  const counted = round2(days.reduce((t, d) => t + d.reconcile.collected.deposit.counted, 0))
  const deposited = round2(days.reduce((t, d) => t + d.reconcile.collected.deposit.deposited, 0))
  const depositDiff = round2(deposited - counted)
  const deposit = {
    counted,
    deposited,
    diff: depositDiff,
    status: Math.abs(depositDiff) > OVER_SHORT_LOOK_THRESHOLD ? ('differs' as const) : ('match' as const)
  }

  const byDay: RangeByDay[] = days.map((d) => {
    const lines = d.reconcile.collected.lines
    const dep = d.reconcile.collected.deposit
    const n = lines.filter((l) => l.status === 'differs').length + (dep.status === 'differs' ? 1 : 0)
    return {
      date: d.date,
      cashOverShort: lines.find((l) => l.key === 'cashChecks')?.overShort ?? 0,
      creditOverShort: lines.find((l) => l.key === 'credits')?.overShort ?? 0,
      depositDiff: dep.diff,
      depositStatus: dep.status,
      differenceCount: n,
      verdictText: n === 0 ? 'All match' : `${n} ${n === 1 ? 'difference' : 'differences'}`
    }
  })

  const notes: string[] = []
  if (days.length > 0 && Math.abs(cashChecks.overShort) >= TOLERANCE) {
    const short = byDay.filter((x) => x.cashOverShort < -TOLERANCE)
    const over = byDay.filter((x) => x.cashOverShort > TOLERANCE)
    const worst = [...byDay].sort((a, b) => a.cashOverShort - b.cashOverShort)[0]
    notes.push(
      `Cash + Checks ${cashChecks.overShort < 0 ? 'short' : 'over'} ${money(Math.abs(cashChecks.overShort))} over ${days.length} ${days.length === 1 ? 'day' : 'days'} (${short.length} ${short.length === 1 ? 'day' : 'days'} short, ${over.length} over).` +
        (worst && worst.cashOverShort < -TOLERANCE
          ? ` Largest shortage: ${shortDate(worst.date)} ${money(worst.cashOverShort, true)}.`
          : '')
    )
  }
  const gaps = byDay.filter((x) => x.depositStatus === 'differs')
  if (gaps.length > 0) {
    notes.push(
      `Deposit more than ${money(OVER_SHORT_LOOK_THRESHOLD)} away from the cash counted: ${gaps
        .map((x) => `${shortDate(x.date)} ${money(x.depositDiff, true)}`)
        .join(', ')}. Net for the range ${money(depositDiff, true)}.`
    )
  }
  const other = collected.filter((l) => l.key !== 'cashChecks' && l.status === 'differs')
  if (other.length > 0) {
    notes.push(`Other over/short: ${other.map((l) => `${l.label} ${money(l.overShort, true)}`).join(', ')}.`)
  }
  const missingCstoreDates = days.filter((d) => !d.reconcile.hasCstore).map((d) => d.date)
  if (missingCstoreDates.length > 0) {
    notes.push(
      `Sales and fuel cover ${withCstore.length} of ${days.length} days. No Cstore report for ${missingCstoreDates.map(shortDate).join(', ')}.`
    )
  }

  return {
    from: days[0]?.date ?? '',
    to: days[days.length - 1]?.date ?? '',
    dayCount: days.length,
    cstoreDayCount: withCstore.length,
    missingCstoreDates,
    sales: { lines: salesLines, totalSales },
    fuel,
    collected,
    cashChecks,
    deposit,
    byDay,
    notes
  }
}
