const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { rowsForLpgImport } = require('./lpgRows')
const { usDateInMonth } = require('./invoiceMonth')

describe('LPG invoice rows', () => {
  const month = { year: 2026, month: 9, confirmedVendor: 'Rubis West Indies' }

  it('keeps Rubis rows in the requested month', () => {
    const result = rowsForLpgImport(
      [
        { invoiceNumber: '100', invoiceDate: '9/2/2026', amount: 40, vendor: 'Rubis West Indies' },
        { invoiceNumber: '101', invoiceDate: '8/30/2026', amount: 40, vendor: 'Rubis West Indies' },
        { invoiceNumber: '102', invoiceDate: '9/4/2026', amount: 18, vendor: 'Acado' }
      ],
      month
    )
    assert.deepEqual(
      result.kept.map((row) => row.invoiceNumber),
      ['100']
    )
    assert.equal(result.rejected, 2)
  })

  it('does not stamp a vendor onto a mixed list', () => {
    const result = rowsForLpgImport(
      [
        { invoiceNumber: '100', invoiceDate: '9/2/2026', amount: 40, vendor: '' },
        { invoiceNumber: '102', invoiceDate: '9/4/2026', amount: 18, vendor: 'Acado' }
      ],
      month
    )
    assert.equal(result.kept.length, 0)
    assert.equal(result.rejected, 2)
  })

  it('stamps Rubis when the dropdown is confirmed and the grid has no vendor column', () => {
    const result = rowsForLpgImport(
      [{ invoiceNumber: '100', invoiceDate: '09/02/2026', amount: 40, vendor: '' }],
      month
    )
    assert.equal(result.kept.length, 1)
    assert.equal(result.kept[0].vendor, 'Rubis West Indies')
  })

  it('leaves the list empty when the vendor dropdown was not confirmed', () => {
    const result = rowsForLpgImport(
      [{ invoiceNumber: '100', invoiceDate: '9/2/2026', amount: 40, vendor: '' }],
      { year: 2026, month: 9, confirmedVendor: '' }
    )
    assert.equal(result.kept.length, 0)
  })
})

describe('invoice month', () => {
  it('matches US and ISO dates to the calendar month', () => {
    assert.equal(usDateInMonth('9/30/2026', 2026, 9), true)
    assert.equal(usDateInMonth('10/1/2026', 2026, 9), false)
    assert.equal(usDateInMonth('2026-09-01', 2026, 9), true)
  })
})
