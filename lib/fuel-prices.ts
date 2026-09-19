import { addCalendarDaysYmd, isYmd } from '@/lib/datetime-policy'

export const FUEL_PRICE_PRODUCTS = ['unleaded', 'diesel'] as const
export const FUEL_PRICE_KINDS = ['selling', 'cost'] as const
export const FUEL_PRICE_SOURCES = ['manual', 'invoice'] as const

export type FuelPriceProduct = (typeof FUEL_PRICE_PRODUCTS)[number]
export type FuelPriceKind = (typeof FUEL_PRICE_KINDS)[number]
export type FuelPriceSource = (typeof FUEL_PRICE_SOURCES)[number]

export type FuelPriceRecord = {
  id: string
  product: FuelPriceProduct
  kind: FuelPriceKind
  pricePerLitre: number
  unit: string
  effectiveFrom: string
  effectiveTo: string | null
  source: string
  notes: string
  createdBy: string
  createdAt: string
  supersededAt: string | null
}

export type FuelPricePair = {
  selling: FuelPriceRecord | null
  cost: FuelPriceRecord | null
}

export type CurrentFuelPrices = {
  unleaded: FuelPricePair
  diesel: FuelPricePair
}

export function isFuelPriceProduct(value: string): value is FuelPriceProduct {
  return (FUEL_PRICE_PRODUCTS as readonly string[]).includes(value)
}

export function isFuelPriceKind(value: string): value is FuelPriceKind {
  return (FUEL_PRICE_KINDS as readonly string[]).includes(value)
}

export function isFuelPriceSource(value: string): value is FuelPriceSource {
  return (FUEL_PRICE_SOURCES as readonly string[]).includes(value)
}

export function productLabel(product: FuelPriceProduct): string {
  return product === 'unleaded' ? 'Unleaded' : 'Diesel'
}

export function kindLabel(kind: FuelPriceKind): string {
  return kind === 'selling' ? 'Pump' : 'Cost'
}

export function roundPricePerLitre(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function parsePricePerLitre(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return roundPricePerLitre(n)
}

export function formatPricePerLitre(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(value)
}

export function marginPerLitre(selling: number | null | undefined, cost: number | null | undefined): number | null {
  if (selling == null || cost == null || !Number.isFinite(selling) || !Number.isFinite(cost)) return null
  return roundPricePerLitre(selling - cost)
}

export function isActivePrice(row: { supersededAt: string | null }): boolean {
  return row.supersededAt == null
}

export function coversDate(
  row: { effectiveFrom: string; effectiveTo: string | null },
  ymd: string
): boolean {
  if (row.effectiveFrom > ymd) return false
  if (row.effectiveTo != null && row.effectiveTo < ymd) return false
  return true
}

export function intervalsOverlap(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null
): boolean {
  const aEnd = aTo ?? '9999-12-31'
  const bEnd = bTo ?? '9999-12-31'
  return aFrom <= bEnd && bFrom <= aEnd
}

export function priceOnDate(
  rows: FuelPriceRecord[],
  product: FuelPriceProduct,
  kind: FuelPriceKind,
  ymd: string
): FuelPriceRecord | null {
  const matches = rows.filter(
    (row) =>
      isActivePrice(row) && row.product === product && row.kind === kind && coversDate(row, ymd)
  )
  if (matches.length === 0) return null
  matches.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return a.id < b.id ? 1 : -1
  })
  return matches[0]
}

export function currentFuelPrices(rows: FuelPriceRecord[], todayYmd: string): CurrentFuelPrices {
  return {
    unleaded: {
      selling: priceOnDate(rows, 'unleaded', 'selling', todayYmd),
      cost: priceOnDate(rows, 'unleaded', 'cost', todayYmd)
    },
    diesel: {
      selling: priceOnDate(rows, 'diesel', 'selling', todayYmd),
      cost: priceOnDate(rows, 'diesel', 'cost', todayYmd)
    }
  }
}

export type FuelPriceChangeInput = {
  product: FuelPriceProduct
  kind: FuelPriceKind
  pricePerLitre: number
  effectiveFrom: string
  effectiveTo?: string | null
  source?: FuelPriceSource
  notes?: string
  createdBy: string
}

export type FuelPriceChangePlan = {
  supersedeIds: string[]
  closeUpdates: { id: string; effectiveTo: string }[]
  insert: {
    product: FuelPriceProduct
    kind: FuelPriceKind
    pricePerLitre: number
    unit: 'litre'
    effectiveFrom: string
    effectiveTo: string | null
    source: FuelPriceSource
    notes: string
    createdBy: string
  }
}

function describeInterval(from: string, to: string | null): string {
  return to ? `${from} to ${to}` : `${from} (current)`
}

function overlappingActive(
  rows: FuelPriceRecord[],
  product: FuelPriceProduct,
  kind: FuelPriceKind,
  from: string,
  to: string | null,
  ignoreIds: Set<string>
): FuelPriceRecord | undefined {
  return rows.find(
    (row) =>
      isActivePrice(row) &&
      !ignoreIds.has(row.id) &&
      row.product === product &&
      row.kind === kind &&
      intervalsOverlap(row.effectiveFrom, row.effectiveTo, from, to)
  )
}

export function planFuelPriceChange(
  existing: FuelPriceRecord[],
  input: FuelPriceChangeInput
): { ok: true; plan: FuelPriceChangePlan } | { ok: false; error: string } {
  if (!isYmd(input.effectiveFrom)) {
    return { ok: false, error: 'effectiveFrom must be YYYY-MM-DD' }
  }
  const effectiveTo = input.effectiveTo ?? null
  if (effectiveTo != null && !isYmd(effectiveTo)) {
    return { ok: false, error: 'effectiveTo must be YYYY-MM-DD' }
  }
  if (effectiveTo != null && effectiveTo < input.effectiveFrom) {
    return { ok: false, error: 'effectiveTo cannot be before effectiveFrom' }
  }
  if (!Number.isFinite(input.pricePerLitre) || input.pricePerLitre <= 0) {
    return { ok: false, error: 'pricePerLitre must be greater than 0' }
  }

  const source = input.source ?? 'manual'
  const notes = (input.notes ?? '').trim()
  const productRows = existing.filter(
    (row) => row.product === input.product && row.kind === input.kind
  )
  const open = productRows.find((row) => isActivePrice(row) && row.effectiveTo == null)

  const supersedeIds: string[] = []
  const closeUpdates: { id: string; effectiveTo: string }[] = []

  if (effectiveTo == null && open) {
    if (input.effectiveFrom < open.effectiveFrom) {
      return {
        ok: false,
        error: `Current ${productLabel(input.product)} ${kindLabel(input.kind).toLowerCase()} price already starts ${open.effectiveFrom}. Enter an end date to backfill an earlier range.`
      }
    }
    if (input.effectiveFrom === open.effectiveFrom) {
      supersedeIds.push(open.id)
    } else {
      closeUpdates.push({
        id: open.id,
        effectiveTo: addCalendarDaysYmd(input.effectiveFrom, -1)
      })
    }
  }

  const ignoreIds = new Set([...supersedeIds, ...closeUpdates.map((row) => row.id)])
  const overlap = overlappingActive(
    productRows,
    input.product,
    input.kind,
    input.effectiveFrom,
    effectiveTo,
    ignoreIds
  )
  if (overlap) {
    return {
      ok: false,
      error: `Overlaps existing ${productLabel(input.product)} ${kindLabel(input.kind).toLowerCase()} price ${describeInterval(overlap.effectiveFrom, overlap.effectiveTo)}.`
    }
  }

  return {
    ok: true,
    plan: {
      supersedeIds,
      closeUpdates,
      insert: {
        product: input.product,
        kind: input.kind,
        pricePerLitre: roundPricePerLitre(input.pricePerLitre),
        unit: 'litre',
        effectiveFrom: input.effectiveFrom,
        effectiveTo,
        source,
        notes,
        createdBy: input.createdBy
      }
    }
  }
}

function applyPlanToRecords(
  existing: FuelPriceRecord[],
  plan: FuelPriceChangePlan,
  newId: string
): FuelPriceRecord[] {
  const supersededAt = new Date().toISOString()
  const next = existing.map((row) => {
    if (plan.supersedeIds.includes(row.id)) {
      return { ...row, supersededAt }
    }
    const close = plan.closeUpdates.find((update) => update.id === row.id)
    if (close) return { ...row, effectiveTo: close.effectiveTo }
    return row
  })
  next.push({
    id: newId,
    ...plan.insert,
    createdAt: supersededAt,
    supersededAt: null
  })
  return next
}

export function planFuelPriceChanges(
  existing: FuelPriceRecord[],
  inputs: FuelPriceChangeInput[]
): { ok: true; plans: FuelPriceChangePlan[] } | { ok: false; error: string } {
  if (inputs.length === 0) {
    return { ok: false, error: 'At least one price is required' }
  }
  const seen = new Set<string>()
  for (const input of inputs) {
    const key = `${input.product}:${input.kind}`
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate ${productLabel(input.product)} ${kindLabel(input.kind).toLowerCase()} price in this save` }
    }
    seen.add(key)
  }

  const plans: FuelPriceChangePlan[] = []
  let working = existing.slice()
  for (let i = 0; i < inputs.length; i++) {
    const planned = planFuelPriceChange(working, inputs[i])
    if (!planned.ok) return planned
    plans.push(planned.plan)
    working = applyPlanToRecords(working, planned.plan, `pending-${i}`)
  }
  return { ok: true, plans }
}
