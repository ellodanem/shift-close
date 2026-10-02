import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NIS_MONTHLY_CAP,
  NIS_RATE,
  PAYE_MONTHLY_FREE,
  PAYE_RATE,
  computeNisShare,
  computePaye,
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
    assert.equal(pay.paye, 0)
    assert.equal(pay.netPay, 935)
    assert.equal(payMonthKey('2026-03-15'), '2026-03')
  })

  it('taxes 15% of pay after NIC above $2,500 a month', () => {
    assert.equal(PAYE_RATE, 0.15)
    assert.equal(PAYE_MONTHLY_FREE, 2500)
    const pay = computePayRunDeductions({ grossPay: 3000, taxablePay: 3000 })
    assert.equal(pay.nisEmployee, 150)
    assert.equal(pay.paye, 52.5)
    assert.equal(pay.netPay, 2797.5)
    assert.equal(computePaye({ taxablePay: 2500, employeeNic: 125 }), 0)
  })

  it('leaves a justified allowance out of PAYE and still takes NIC on it', () => {
    const pay = computePayRunDeductions({ grossPay: 3800, taxablePay: 3300 })
    assert.equal(pay.nisEmployee, 190)
    assert.equal(pay.paye, 91.5)
    assert.equal(pay.netPay, 3518.5)
  })

  it('uses the monthly free amount once across two pays', () => {
    const first = computePaye({ taxablePay: 1500, employeeNic: 75 })
    assert.equal(first, 0)
    const second = computePaye({
      taxablePay: 1800,
      employeeNic: 90,
      prior: { taxablePay: 1500, employeeNic: 75, paye: first }
    })
    assert.equal(second, 95.25)
    const later = computePaye({
      taxablePay: 1000,
      employeeNic: 50,
      prior: { taxablePay: 4000, employeeNic: 200, paye: 195 }
    })
    assert.equal(later, 142.5)
  })
})
