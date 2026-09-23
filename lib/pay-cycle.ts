/** Staff pay cadence. Semi-monthly is Pay+ “Bi-monthly” (1–15 / 16–end). */
export const PAY_CYCLE_VALUES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const

export type PayCycle = (typeof PAY_CYCLE_VALUES)[number]

export const DEFAULT_PAY_CYCLE: PayCycle = 'semimonthly'

export const PAY_CYCLE_LABELS: Record<PayCycle, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  semimonthly: 'Semi-monthly',
  monthly: 'Monthly'
}

/** Standard hours before overtime (40 × 52 / pays-per-year). */
export const PAY_CYCLE_HOUR_CAPS: Record<PayCycle, number> = {
  weekly: 40,
  biweekly: 80,
  semimonthly: 86.67,
  monthly: 173.33
}

export type PayPeriodHoursSplit = {
  cycle: PayCycle
  cap: number
  basicHours: number
  otHours: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function isPayCycle(value: unknown): value is PayCycle {
  return typeof value === 'string' && (PAY_CYCLE_VALUES as readonly string[]).includes(value)
}

export function parsePayCycle(value: unknown): PayCycle {
  return isPayCycle(value) ? value : DEFAULT_PAY_CYCLE
}

export function payCycleLabel(value: unknown): string {
  return PAY_CYCLE_LABELS[parsePayCycle(value)]
}

/** Split clocked hours into Pay+ BSC / OTH using the staff member’s cycle cap. */
export function splitPayPeriodHours(transTtl: number, cycle?: unknown): PayPeriodHoursSplit {
  const parsed = parsePayCycle(cycle)
  const cap = PAY_CYCLE_HOUR_CAPS[parsed]
  const hours = Number.isFinite(transTtl) ? Math.max(0, transTtl) : 0
  const basicHours = round2(Math.min(hours, cap))
  const otHours = round2(Math.max(0, hours - cap))
  return { cycle: parsed, cap, basicHours, otHours }
}
