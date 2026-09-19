import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  coversDate,
  currentFuelPrices,
  formatPricePerLitre,
  marginPerLitre,
  parsePricePerLitre,
  planFuelPriceChange,
  planFuelPriceChanges,
  priceOnDate,
  type FuelPriceRecord
} from '../lib/fuel-prices'

function row(partial: Partial<FuelPriceRecord> & Pick<FuelPriceRecord, 'id' | 'kind' | 'pricePerLitre' | 'effectiveFrom'>): FuelPriceRecord {
  return {
    product: 'unleaded',
    unit: 'litre',
    effectiveTo: null,
    source: 'manual',
    notes: '',
    createdBy: 'admin',
    createdAt: '2026-09-01T12:00:00.000Z',
    supersededAt: null,
    ...partial
  }
}

describe('fuel price parsing', () => {
  it('rejects zero and non-numeric prices', () => {
    assert.equal(parsePricePerLitre(0), null)
    assert.equal(parsePricePerLitre('abc'), null)
    assert.equal(parsePricePerLitre(''), null)
    assert.equal(parsePricePerLitre('17.5055'), 17.5055)
  })

  it('formats unit prices and margin', () => {
    assert.equal(formatPricePerLitre(17.5), '$17.50')
    assert.equal(marginPerLitre(18, 16.25), 1.75)
    assert.equal(marginPerLitre(18, null), null)
  })
})

describe('fuel price lookup', () => {
  const history: FuelPriceRecord[] = [
    row({
      id: 'old',
      kind: 'selling',
      pricePerLitre: 16,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-03-31',
      createdAt: '2026-01-01T12:00:00.000Z'
    }),
    row({
      id: 'now',
      kind: 'selling',
      pricePerLitre: 17.5,
      effectiveFrom: '2026-04-01',
      createdAt: '2026-04-01T12:00:00.000Z'
    }),
    row({
      id: 'typo',
      kind: 'selling',
      pricePerLitre: 99,
      effectiveFrom: '2026-04-01',
      createdAt: '2026-04-01T13:00:00.000Z',
      supersededAt: '2026-04-01T13:00:00.000Z'
    })
  ]

  it('uses inclusive from/to and ignores superseded rows', () => {
    assert.equal(coversDate(history[0], '2026-03-31'), true)
    assert.equal(coversDate(history[0], '2026-04-01'), false)
    assert.equal(priceOnDate(history, 'unleaded', 'selling', '2026-03-15')?.id, 'old')
    assert.equal(priceOnDate(history, 'unleaded', 'selling', '2026-04-01')?.id, 'now')
    assert.equal(priceOnDate(history, 'unleaded', 'selling', '2026-09-19')?.pricePerLitre, 17.5)
    assert.equal(priceOnDate(history, 'diesel', 'selling', '2026-09-19'), null)
  })

  it('builds current pump and cost pairs', () => {
    const withCost = [
      ...history,
      row({
        id: 'cost',
        kind: 'cost',
        pricePerLitre: 15.1,
        effectiveFrom: '2026-08-01'
      })
    ]
    const current = currentFuelPrices(withCost, '2026-09-19')
    assert.equal(current.unleaded.selling?.pricePerLitre, 17.5)
    assert.equal(current.unleaded.cost?.pricePerLitre, 15.1)
    assert.equal(current.diesel.selling, null)
  })
})

describe('fuel price changes', () => {
  it('inserts the first current price', () => {
    const planned = planFuelPriceChange([], {
      product: 'unleaded',
      kind: 'selling',
      pricePerLitre: 17.5,
      effectiveFrom: '2026-09-19',
      createdBy: 'u1'
    })
    assert.equal(planned.ok, true)
    if (!planned.ok) return
    assert.deepEqual(planned.plan.supersedeIds, [])
    assert.deepEqual(planned.plan.closeUpdates, [])
    assert.equal(planned.plan.insert.effectiveTo, null)
    assert.equal(planned.plan.insert.pricePerLitre, 17.5)
  })

  it('closes the previous current row the day before the new price', () => {
    const existing = [
      row({
        id: 'open',
        kind: 'selling',
        pricePerLitre: 16,
        effectiveFrom: '2026-04-01'
      })
    ]
    const planned = planFuelPriceChange(existing, {
      product: 'unleaded',
      kind: 'selling',
      pricePerLitre: 17.5,
      effectiveFrom: '2026-09-19',
      createdBy: 'u1'
    })
    assert.equal(planned.ok, true)
    if (!planned.ok) return
    assert.deepEqual(planned.plan.closeUpdates, [{ id: 'open', effectiveTo: '2026-09-18' }])
    assert.equal(planned.plan.insert.effectiveFrom, '2026-09-19')
  })

  it('supersedes a same-day current price instead of rewriting it', () => {
    const existing = [
      row({
        id: 'open',
        kind: 'selling',
        pricePerLitre: 16,
        effectiveFrom: '2026-09-19'
      })
    ]
    const planned = planFuelPriceChange(existing, {
      product: 'unleaded',
      kind: 'selling',
      pricePerLitre: 17.5,
      effectiveFrom: '2026-09-19',
      createdBy: 'u1'
    })
    assert.equal(planned.ok, true)
    if (!planned.ok) return
    assert.deepEqual(planned.plan.supersedeIds, ['open'])
    assert.deepEqual(planned.plan.closeUpdates, [])
  })

  it('accepts a closed historical range that does not overlap', () => {
    const existing = [
      row({
        id: 'open',
        kind: 'selling',
        pricePerLitre: 17.5,
        effectiveFrom: '2026-04-01'
      })
    ]
    const planned = planFuelPriceChange(existing, {
      product: 'unleaded',
      kind: 'selling',
      pricePerLitre: 16,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-03-31',
      createdBy: 'u1'
    })
    assert.equal(planned.ok, true)
    if (!planned.ok) return
    assert.deepEqual(planned.plan.closeUpdates, [])
    assert.equal(planned.plan.insert.effectiveTo, '2026-03-31')
  })

  it('rejects overlap with existing history', () => {
    const existing = [
      row({
        id: 'old',
        kind: 'selling',
        pricePerLitre: 16,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-03-31'
      })
    ]
    const planned = planFuelPriceChange(existing, {
      product: 'unleaded',
      kind: 'selling',
      pricePerLitre: 16.5,
      effectiveFrom: '2026-03-01',
      effectiveTo: '2026-03-15',
      createdBy: 'u1'
    })
    assert.equal(planned.ok, false)
    if (planned.ok) return
    assert.match(planned.error, /Overlaps/)
  })

  it('rejects a new current price that starts before the open current', () => {
    const existing = [
      row({
        id: 'open',
        kind: 'selling',
        pricePerLitre: 17.5,
        effectiveFrom: '2026-04-01'
      })
    ]
    const planned = planFuelPriceChange(existing, {
      product: 'unleaded',
      kind: 'selling',
      pricePerLitre: 16,
      effectiveFrom: '2026-03-01',
      createdBy: 'u1'
    })
    assert.equal(planned.ok, false)
  })

  it('plans several products in one save', () => {
    const planned = planFuelPriceChanges([], [
      {
        product: 'unleaded',
        kind: 'selling',
        pricePerLitre: 17.5,
        effectiveFrom: '2026-09-19',
        createdBy: 'u1'
      },
      {
        product: 'diesel',
        kind: 'cost',
        pricePerLitre: 15,
        effectiveFrom: '2026-09-19',
        createdBy: 'u1'
      }
    ])
    assert.equal(planned.ok, true)
    if (!planned.ok) return
    assert.equal(planned.plans.length, 2)
  })
})
