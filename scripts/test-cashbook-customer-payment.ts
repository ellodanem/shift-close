import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { customerPaymentCashbookFields } from '../lib/cashbook-customer-payment'

describe('customer payment cashbook booking', () => {
  it('books every payment as deposit income and ignores the payment type', () => {
    const check = customerPaymentCashbookFields({
      id: 'p1',
      date: '2026-09-27',
      account: 'Distillers',
      amount: 120.5,
      ref: '441',
      paymentMethod: 'check'
    })
    const eft = customerPaymentCashbookFields({
      id: 'p2',
      date: '2026-09-27',
      account: 'Barbay',
      amount: 80,
      paymentMethod: 'eft'
    })

    assert.equal(check.categoryName, 'Deposit')
    assert.equal(check.categoryType, 'income')
    assert.equal(check.paymentMethod, 'deposit')
    assert.equal(check.creditAmt, 120.5)
    assert.equal(check.description, 'Distillers')
    assert.equal(check.ref, '441')
    assert.equal(check.debitCash, 0)
    assert.equal(check.debitCheck, 0)

    assert.equal(eft.paymentMethod, 'deposit')
    assert.equal(eft.categoryType, 'income')
    assert.equal(eft.description, 'Barbay')
    assert.equal(eft.ref, null)
  })
})
