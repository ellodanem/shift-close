import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { harvestInvoiceRejectReason } from '../lib/harvest-fuel-invoice-rules'

describe('harvest fuel invoice gate', () => {
  it('accepts an in-month fuel delivery', () => {
    assert.equal(
      harvestInvoiceRejectReason(
        { ymd: '2026-10-03', type: 'Fuel' },
        { year: 2026, month: 10 }
      ),
      null
    )
  })

  it('leaves out fuel deliveries from other months', () => {
    assert.equal(
      harvestInvoiceRejectReason(
        { ymd: '2026-08-03', type: 'Fuel' },
        { year: 2026, month: 10 }
      ),
      'outside 2026-10'
    )
  })

  it('leaves out grocery invoices that are not Rubis', () => {
    assert.equal(
      harvestInvoiceRejectReason(
        { ymd: '2026-09-04', type: 'LPG', vendor: 'Acado' },
        { year: 2026, month: 9 }
      ),
      'not Rubis West Indies'
    )
  })

  it('leaves out an LPG row with no vendor', () => {
    assert.equal(
      harvestInvoiceRejectReason(
        { ymd: '2026-09-04', type: 'LPG', vendor: '' },
        { year: 2026, month: 9 }
      ),
      'not Rubis West Indies'
    )
  })

  it('accepts Rubis LPG in the requested month', () => {
    assert.equal(
      harvestInvoiceRejectReason(
        { ymd: '2026-09-04', type: 'LPG', vendor: 'Rubis West Indies' },
        { year: 2026, month: 9 }
      ),
      null
    )
  })
})
