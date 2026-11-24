const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { rowsForVendorImport, cstoreRowVendorMatches } = require('./vendorInvoiceRows')

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

  it('leaves out other vendors and Rubis when a vendor is confirmed', () => {
    const result = rowsForVendorImport(
      [
        { invoiceNumber: '1161196', invoiceDate: '10/30/2026', amount: 2308.6, vendor: 'Rubis West Indies' },
        { invoiceNumber: '88330', invoiceDate: '10/30/2026', amount: 45, vendor: 'Banana Click' },
        { invoiceNumber: '2078496', invoiceDate: '10/29/2026', amount: 2126.88, vendor: 'Accado' },
        { invoiceNumber: '2078497', invoiceDate: '10/29/2026', amount: 10, vendor: '' }
      ],
      { year: 2026, month: 10, confirmedVendor: 'Accado' }
    )
    assert.deepEqual(
      result.kept.map((row) => row.invoiceNumber),
      ['2078496', '2078497']
    )
    assert.equal(result.rejected, 2)
  })

  it('treats a blank vendor column as the selected vendor', () => {
    assert.equal(cstoreRowVendorMatches('', 'Acado'), true)
    assert.equal(cstoreRowVendorMatches('Banana Click', 'Acado'), false)
    assert.equal(cstoreRowVendorMatches('Accado', 'Acado'), false)
  })
})
