import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  paidVendorInvoiceCovers,
  vendorInvoiceOutsideMonth
} from '../lib/harvest-vendor-invoices'

describe('vendor invoice harvest gate', () => {
  it('keeps a purchase in the selected month', () => {
    assert.equal(vendorInvoiceOutsideMonth('2026-10-03', 2026, 10), false)
  })

  it('leaves out a purchase from another month', () => {
    assert.equal(vendorInvoiceOutsideMonth('2024-06-01', 2026, 10), true)
    assert.equal(vendorInvoiceOutsideMonth('2026-09-30', 2026, 10), true)
  })

  it('does not apply a month gate when no month was requested', () => {
    assert.equal(vendorInvoiceOutsideMonth('2024-06-01'), false)
  })

  it('ignores an invoice already marked paid on that date', () => {
    assert.equal(
      paidVendorInvoiceCovers(
        { invoiceNumber: '2062886', invoiceDateYmd: '2026-08-26', status: 'paid' },
        '2062886',
        '2026-08-26'
      ),
      true
    )
    assert.equal(
      paidVendorInvoiceCovers(
        { invoiceNumber: '2062886A', invoiceDateYmd: '2026-08-26', status: 'paid' },
        '2062886',
        '2026-08-26'
      ),
      true
    )
  })

  it('still adds a pending invoice and a paid invoice from another date', () => {
    assert.equal(
      paidVendorInvoiceCovers(
        { invoiceNumber: '2062886', invoiceDateYmd: '2026-08-26', status: 'pending' },
        '2062886',
        '2026-08-26'
      ),
      false
    )
    assert.equal(
      paidVendorInvoiceCovers(
        { invoiceNumber: '2062886', invoiceDateYmd: '2026-07-01', status: 'paid' },
        '2062886',
        '2026-08-26'
      ),
      false
    )
  })
})
