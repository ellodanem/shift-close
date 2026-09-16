import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  defaultDepartmentSales,
  departmentRowsForPersist,
  mergeDepartmentSales,
  parseSalesPayload,
  salesAmountTotal,
  systemTenderTotal
} from '../lib/shift-sales'

describe('shift sales', () => {
  it('defaults five department rows', () => {
    const rows = defaultDepartmentSales()
    assert.deepEqual(
      rows.map((r) => r.category),
      ['unleaded', 'diesel', 'lpg', 'lubricants', 'cstore']
    )
  })

  it('uses fuel litres from the shift for unleaded and diesel qty', () => {
    const merged = mergeDepartmentSales(
      [{ category: 'cstore', label: 'C-Store', quantity: null, unit: null, amount: 120, source: 'pos', posKey: '', sortOrder: 4 }],
      { unleaded: 80, diesel: 40 }
    )
    assert.equal(merged[0].quantity, 80)
    assert.equal(merged[1].quantity, 40)
    assert.equal(merged[4].amount, 120)
    assert.equal(merged[4].source, 'pos')
  })

  it('leaves POS SKU lines out of department merge', () => {
    const merged = mergeDepartmentSales(
      [{ category: 'cstore', label: 'Coke 500ml', quantity: 6, unit: 'each', amount: 30, source: 'pos', posKey: 'sku-1', sortOrder: 9 }],
      { unleaded: 0, diesel: 0 }
    )
    assert.equal(merged[4].amount, 0)
    assert.equal(merged[4].source, 'manual')
  })

  it('parses a mixed payload and stamps fuel qty on persist rows', () => {
    const parsed = parseSalesPayload(
      [
        { category: 'unleaded', amount: 2100, source: 'manual' },
        { category: 'lpg', quantity: 4, amount: 160 }
      ],
      { unleaded: 55.5, diesel: 10 }
    )
    assert.equal(parsed[0].quantity, 55.5)
    assert.equal(parsed[1].quantity, 4)

    const persist = departmentRowsForPersist(
      [
        { category: 'unleaded', amount: 2100 },
        { category: 'diesel', amount: 900 },
        { category: 'lpg', quantity: 4, amount: 160 },
        { category: 'lubricants', quantity: 2, amount: 80 },
        { category: 'cstore', amount: 300 }
      ],
      { unleaded: 55.5, diesel: 10 }
    )
    assert.equal(persist.length, 5)
    assert.equal(persist[0].quantity, 55.5)
    assert.equal(persist[1].quantity, 10)
    assert.equal(salesAmountTotal(persist), 3540)
  })

  it('compares sales total to system tenders', () => {
    const tenders = systemTenderTotal({
      systemCash: 100,
      systemChecks: 0,
      systemCredit: 20,
      systemDebit: 30,
      otherCredit: 5,
      systemInhouse: 10,
      systemFleet: 8,
      systemMassyCoupons: 2
    })
    assert.equal(tenders, 175)
  })
})
