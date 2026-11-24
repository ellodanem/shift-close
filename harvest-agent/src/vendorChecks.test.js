const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parsePaymentType, groupVendorChecks } = require('./vendorChecks')

describe('Cstore check payments', () => {
  it('reads a check number and ignores the previously-unpaid line', () => {
    assert.deepEqual(parsePaymentType('Check (# 857)\nPreviously Unpaid'), {
      kind: 'check',
      number: '857'
    })
    assert.deepEqual(parsePaymentType('Cheque #0857'), { kind: 'check', number: '857' })
  })

  it('reads EFT with or without a reference number', () => {
    assert.deepEqual(parsePaymentType('EFT'), { kind: 'eft', number: 'EFT' })
    assert.deepEqual(parsePaymentType('EFT (# 44)'), { kind: 'eft', number: '44' })
    assert.deepEqual(parsePaymentType('Previously Unpaid'), { kind: 'other' })
  })

  it('groups August Acado into one check 857', () => {
    const grouped = groupVendorChecks([
      {
        invoiceNumber: '002093072',
        invoiceDate: '8/26/2026',
        amount: 2484.35,
        paymentType: 'Check (# 857)\nPreviously Unpaid'
      },
      {
        invoiceNumber: '2062886',
        invoiceDate: '8/24/2026',
        amount: 1897.31,
        paymentType: 'Check (# 857) Previously Unpaid'
      },
      {
        invoiceNumber: '2050106',
        invoiceDate: '8/6/2026',
        amount: 1804.17,
        paymentType: 'Check (# 857)'
      },
      {
        invoiceNumber: '2058939',
        invoiceDate: '8/5/2026',
        amount: 2008.27,
        paymentType: 'Check (#857)'
      },
      {
        invoiceNumber: '002093072',
        invoiceDate: '8/26/2026',
        amount: 2484.35,
        paymentType: 'Check (# 857)'
      },
      { invoiceNumber: '9001', invoiceDate: '8/1/2026', amount: 10, paymentType: 'EFT' },
      { invoiceNumber: '9002', invoiceDate: '8/2/2026', amount: 12, paymentType: 'EFT (# 44)' }
    ])

    assert.equal(grouped.skippedEft, 0)
    assert.equal(grouped.checks.length, 3)
    assert.equal(grouped.checks[0].checkNumber, '857')
    assert.equal(grouped.checks[0].paymentMethod, 'check')
    assert.equal(grouped.checks[0].paymentDate, '2026-08-26')
    assert.deepEqual(
      grouped.checks[0].invoices.map((invoice) => invoice.invoiceNumber),
      ['002093072', '2062886', '2050106', '2058939']
    )
    const numberedEft = grouped.checks.find((payment) => payment.checkNumber === '44')
    assert.equal(numberedEft.paymentMethod, 'eft')
    assert.deepEqual(
      numberedEft.invoices.map((invoice) => invoice.invoiceNumber),
      ['9002']
    )
    const plainEft = grouped.checks.find((payment) => payment.checkNumber === 'EFT')
    assert.equal(plainEft.paymentMethod, 'eft')
    assert.deepEqual(
      plainEft.invoices.map((invoice) => invoice.invoiceNumber),
      ['9001']
    )
  })
})
