import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NIS_MONTHLY_CAP,
  NIS_RATE,
  PAYE_ANNUAL_NIS_CAP,
  PAYE_BANDS,
  PAYE_MIN_TAX_CODE,
  computeNisShare,
  computePaye,
  computePayRunDeductions,
  parsePayeTaxCode,
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
    assert.equal(payMonthKey('2026-03-15'), '2026-03')
  })

  it('nets after NIS, loan, medical, shortage, and other deductions', () => {
    const pay = computePayRunDeductions({
      grossPay: 618.74,
      staffLoan: 40,
      medical: 10,
      shortage: 12,
      extraDeductions: [{ label: 'Uniform', amount: 15 }]
    })
    assert.equal(pay.nisEmployee, 30.94)
    assert.equal(pay.nisEmployer, 30.94)
    assert.equal(pay.paye, 0)
    assert.equal(pay.extraDeductionPay, 15)
    assert.equal(pay.totalDeductions, 107.94)
    assert.equal(pay.netPay, 510.8)
  })

  it('uses the PayMS minimum tax code and annual bands', () => {
    assert.equal(PAYE_MIN_TAX_CODE, 254)
    assert.equal(PAYE_ANNUAL_NIS_CAP, 3000)
    assert.equal(parsePayeTaxCode('250'), 254)
    assert.equal(parsePayeTaxCode('300B'), 300)
    assert.equal(parsePayeTaxCode(''), 254)
    assert.deepEqual(PAYE_BANDS.map(({ limit, rate }) => [limit, rate]), [
      [15000, 0.15],
      [30000, 0.2],
      [Number.POSITIVE_INFINITY, 0.3]
    ])
  })

  it('reproduces the PayMS worked monthly example', () => {
    assert.equal(
      computePaye({
        taxablePay: 5000,
        employeeNic: 250,
        payCycle: 'monthly',
        taxCode: '254'
      }),
      477.5
    )
  })

  it('recalculates the sample semi-monthly pays with the PayMS method', () => {
    assert.equal(computePaye({ taxablePay: 3200, employeeNic: 125, payCycle: 'semimonthly', taxCode: '280' }), 416.25)
    assert.equal(computePaye({ taxablePay: 2500, employeeNic: 0, payCycle: 'semimonthly', taxCode: '300', nisExempt: true }), 218.75)
    assert.equal(computePaye({ taxablePay: 2952, employeeNic: 125, payCycle: 'semimonthly', taxCode: '330' }), 279.35)
    assert.equal(computePaye({ taxablePay: 3569, employeeNic: 125, payCycle: 'semimonthly', taxCode: '250' }), 559.45)
    assert.equal(computePaye({ taxablePay: 1300, employeeNic: 65, payCycle: 'semimonthly', taxCode: '290' }), 4)
  })

  it('supports staff who are exempt from NIS', () => {
    const pay = computePayRunDeductions({
      grossPay: 3000,
      taxablePay: 3000,
      nisExempt: true,
      payCycle: 'monthly',
      taxCode: '250'
    })
    assert.equal(pay.nisEmployee, 0)
    assert.equal(pay.nisEmployer, 0)
    assert.equal(pay.paye, 132.5)
    assert.equal(pay.netPay, 2867.5)
  })

  it('supports staff who are exempt from PAYE', () => {
    const pay = computePayRunDeductions({
      grossPay: 5000,
      taxablePay: 5000,
      payCycle: 'monthly',
      taxCode: '254',
      payeExempt: true
    })
    assert.equal(pay.nisEmployee, 250)
    assert.equal(pay.paye, 0)
    assert.equal(pay.netPay, 4750)
  })

  it('can exclude travel from both PAYE and NIS', () => {
    const pay = computePayRunDeductions({
      grossPay: 3700,
      taxablePay: 3200,
      nisEligiblePay: 3200,
      nisEmployeeTaken: 125,
      nisEmployerTaken: 125,
      payCycle: 'semimonthly',
      taxCode: '280'
    })
    assert.equal(pay.nisEmployee, 125)
    assert.equal(pay.nisEmployer, 125)
    assert.equal(pay.paye, 416.25)
    assert.equal(pay.netPay, 3158.75)
  })
})
