import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NIS_MONTHLY_CAP,
  NIS_RATE,
  computeNisShare,
  computePayRunDeductions,
  payMonthKey
} from '../lib/pay-run-deductions'

describe('pay run deductions', () => {
  it('takes 5% NIS up to the $250 monthly cap', () => {
    assert.equal(NIS_RATE, 0.05)
    assert.equal(NIS_MONTHLY_CAP, 250)
    assert.equal(computeNisShare(1000), 50)
    assert.equal(computeNisShare(6000), 250)
    assert.equal(computeNisShare(2000, 220), 30)
    assert.equal(computeNisShare(2000, 250), 0)
  })

  it('nets after NIS, loan, medical, and shortage', () => {
    const pay = computePayRunDeductions({
      grossPay: 618.74,
      staffLoan: 40,
      medical: 10,
      shortage: 12
    })
    assert.equal(pay.nisEmployee, 30.94)
    assert.equal(pay.nisEmployer, 30.94)
    assert.equal(pay.totalDeductions, 92.94)
    assert.equal(pay.netPay, 525.8)
  })

  it('adds optional extra deductions and keeps PAYE out', () => {
    const pay = computePayRunDeductions({
      grossPay: 1000,
      extraDeductions: [{ label: 'Uniform', amount: 15 }]
    })
    assert.equal(pay.nisEmployee, 50)
    assert.equal(pay.extraDeductionPay, 15)
    assert.equal(pay.netPay, 935)
    assert.equal(payMonthKey('2026-03-15'), '2026-03')
  })
})
