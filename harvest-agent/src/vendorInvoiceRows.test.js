const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { rowsForVendorImport } = require('./vendorInvoiceRows')

describe('vendor invoice rows', () => {
  it('keeps only the requested month', () => {
    const result = rowsForVendorImport(
      [
        { invoiceNumber: '1', invoiceDate: '10/2/2026', amount: 10 },
        { invoiceNumber: '2', invoiceDate: '9/30/2026', amount: 10 },
        { invoiceNumber: '3', invoiceDate: '8/1/2024', amount: 10 },
        { invoiceNumber: '4', invoiceDate: '10/7/2026', amount: 12 }
      ],
      { year: 2026, month: 10 }
    )
    assert.deepEqual(
      result.kept.map((row) => row.invoiceNumber),
      ['1', '4']
    )
    assert.equal(result.rejected, 2)
  })
})
