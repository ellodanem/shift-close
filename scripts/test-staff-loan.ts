import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPayRunLines } from '../lib/pay-run'
import {
  capStaffLoanDeduction,
  effectiveStaffLoanDeduction,
  expectedLastPayDate,
  lastLoanInstallment,
  loanInstallment,
  loanRemaining,
  loanThisPay,
  nextPayDate,
  paysForLoanTerm,
  previewStaffLoan,
  termPaysForInstallment
} from '../lib/staff-loan'

describe('staff loan math', () => {
  it('turns months into pays from the staff cycle', () => {
    assert.equal(paysForLoanTerm('semimonthly', 5, 'months'), 10)
    assert.equal(paysForLoanTerm('monthly', 5, 'months'), 5)
    assert.equal(paysForLoanTerm('weekly', 2, 'months'), 8)
    assert.equal(paysForLoanTerm('semimonthly', 7, 'pays'), 7)
  })

  it('splits leftover cents onto the last pay', () => {
    assert.equal(loanInstallment(2000, 10), 200)
    assert.equal(loanInstallment(1000, 3), 333.33)
    assert.equal(lastLoanInstallment(1000, 3), 333.34)
    assert.equal(loanThisPay(333.33, 333.34), 333.34)
  })

  it('stops when remaining is gone', () => {
    assert.equal(loanRemaining(2000, 800), 1200)
    assert.equal(loanThisPay(200, 50), 50)
    assert.equal(loanThisPay(200, 0), 0)
    assert.equal(effectiveStaffLoanDeduction(40, { installment: 200, remaining: 1200 }), 200)
    assert.equal(effectiveStaffLoanDeduction(40, { installment: 200, remaining: 0 }), 40)
    assert.equal(effectiveStaffLoanDeduction(40, null), 40)
    assert.equal(capStaffLoanDeduction(500, 120), 120)
    assert.equal(capStaffLoanDeduction(40, null), 40)
  })

  it('walks semi-monthly pay dates', () => {
    assert.equal(nextPayDate('2026-09-16', 'semimonthly'), '2026-09-30')
    assert.equal(nextPayDate('2026-09-30', 'semimonthly'), '2026-10-15')
    assert.equal(nextPayDate('2026-10-15', 'semimonthly'), '2026-10-31')
    assert.equal(expectedLastPayDate('2026-09-16', 'semimonthly', 10), '2027-01-31')
    const preview = previewStaffLoan({
      principal: 2000,
      termCount: 5,
      termUnit: 'months',
      cycle: 'semimonthly',
      startDate: '2026-09-16'
    })
    assert.equal(preview.termPays, 10)
    assert.equal(preview.installment, 200)
    assert.equal(preview.lastPayDate, '2027-01-31')
  })

  it('keeps a chosen payment amount and stretches the term', () => {
    assert.equal(termPaysForInstallment(5000, 50), 100)
    assert.equal(termPaysForInstallment(5000, 75), 67)
    assert.equal(lastLoanInstallment(5000, 67, 75), 50)
    assert.equal(termPaysForInstallment(1000, 333.33), 3)
    const preview = previewStaffLoan({
      principal: 5000,
      termCount: 5,
      termUnit: 'months',
      cycle: 'semimonthly',
      startDate: '2026-09-16',
      installment: 50
    })
    assert.equal(preview.installment, 50)
    assert.equal(preview.termPays, 100)
  })
})

describe('pay run uses remaining', () => {
  const staff = {
    id: 'h1',
    name: 'Althea Frank',
    status: 'active',
    role: 'cashier',
    nicNumber: '289864',
    payCycle: 'semimonthly',
    payType: 'hourly' as const,
    hourlyRate: 6.75,
    salariedAmount: null,
    staffLoan: 200,
    medicalAmount: 0
  }

  it('takes a smaller last installment', () => {
    const lines = buildPayRunLines({
      cycle: 'semimonthly',
      hoursRows: [{ staffId: 'h1', staffName: 'Althea Frank', transTtl: 80, payCycle: 'semimonthly' }],
      staff: [{ ...staff, loanRemaining: 50 }]
    })
    assert.equal(lines[0]?.staffLoan, 50)
  })

  it('caps a line override at remaining', () => {
    const lines = buildPayRunLines({
      cycle: 'semimonthly',
      hoursRows: [{ staffId: 'h1', staffName: 'Althea Frank', transTtl: 80, payCycle: 'semimonthly' }],
      staff: [{ ...staff, loanRemaining: 80 }],
      deductionOverrides: { h1: { staffLoan: 200 } }
    })
    assert.equal(lines[0]?.staffLoan, 80)
  })

  it('leaves the loan blank after it is repaid', () => {
    const lines = buildPayRunLines({
      cycle: 'semimonthly',
      hoursRows: [{ staffId: 'h1', staffName: 'Althea Frank', transTtl: 80, payCycle: 'semimonthly' }],
      staff: [{ ...staff, staffLoan: 0, loanRemaining: 0 }]
    })
    assert.equal(lines[0]?.staffLoan, 0)
  })
})
