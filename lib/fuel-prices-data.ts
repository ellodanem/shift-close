import { prisma } from '@/lib/prisma'
import { businessTodayYmd } from '@/lib/datetime-policy'
import {
  currentFuelPrices,
  isFuelPriceKind,
  isFuelPriceProduct,
  planFuelPriceChanges,
  type FuelPriceChangeInput,
  type FuelPriceProduct,
  type FuelPriceKind,
  type FuelPriceRecord,
  type FuelPriceSource
} from '@/lib/fuel-prices'

function asRecord(row: {
  id: string
  product: string
  kind: string
  pricePerLitre: number
  unit: string
  effectiveFrom: string
  effectiveTo: string | null
  source: string
  notes: string
  createdBy: string
  createdAt: Date
  supersededAt: Date | null
}): FuelPriceRecord | null {
  if (!isFuelPriceProduct(row.product) || !isFuelPriceKind(row.kind)) return null
  return {
    id: row.id,
    product: row.product,
    kind: row.kind,
    pricePerLitre: row.pricePerLitre,
    unit: row.unit,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    source: row.source,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    supersededAt: row.supersededAt ? row.supersededAt.toISOString() : null
  }
}

export async function loadFuelPriceRecords(): Promise<FuelPriceRecord[]> {
  const rows = await prisma.fuelPrice.findMany({
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }]
  })
  return rows.map(asRecord).filter((row): row is FuelPriceRecord => row != null)
}

export async function loadFuelPricesPayload(asOfYmd = businessTodayYmd()) {
  const history = await loadFuelPriceRecords()
  return {
    today: asOfYmd,
    current: currentFuelPrices(history, asOfYmd),
    history
  }
}

export type SaveFuelPricesInput = {
  effectiveFrom: string
  effectiveTo?: string | null
  notes?: string
  source?: FuelPriceSource
  createdBy: string
  prices: Array<{
    product: FuelPriceProduct
    kind: FuelPriceKind
    pricePerLitre: number
  }>
}

export async function saveFuelPrices(input: SaveFuelPricesInput) {
  const existing = await loadFuelPriceRecords()
  const planned = planFuelPriceChanges(
    existing,
    input.prices.map((price) => ({
      product: price.product,
      kind: price.kind,
      pricePerLitre: price.pricePerLitre,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      source: input.source ?? 'manual',
      notes: input.notes,
      createdBy: input.createdBy
    }))
  )
  if (!planned.ok) {
    return planned
  }

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    for (const plan of planned.plans) {
      if (plan.supersedeIds.length > 0) {
        await tx.fuelPrice.updateMany({
          where: { id: { in: plan.supersedeIds } },
          data: { supersededAt: now }
        })
      }
      for (const close of plan.closeUpdates) {
        await tx.fuelPrice.update({
          where: { id: close.id },
          data: { effectiveTo: close.effectiveTo }
        })
      }
      await tx.fuelPrice.create({
        data: {
          product: plan.insert.product,
          kind: plan.insert.kind,
          pricePerLitre: plan.insert.pricePerLitre,
          unit: plan.insert.unit,
          effectiveFrom: plan.insert.effectiveFrom,
          effectiveTo: plan.insert.effectiveTo,
          source: plan.insert.source,
          notes: plan.insert.notes,
          createdBy: plan.insert.createdBy
        }
      })
    }
  })

  return { ok: true as const, payload: await loadFuelPricesPayload() }
}
