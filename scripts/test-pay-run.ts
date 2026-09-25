import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPayRunLines,
  computeGrossPay,
  inferPayCycleFromRange,
  inferPayRunCycle,
  OT_MULTIPLIER,
  payPeriodSourceHash
} from '../lib/pay-run'

describe('pay run gross', () => {
  it('pays hourly basic and time-and-a-half OT', () => {
    const pay = computeGrossPay({
      payType: 'hourly',
      basicHours: 86.67,
      otHours: 3.33,
      hourlyRate: 6.75
    })
    assert.equal(OT_MULTIPLIER, 1.5)
    assert.equal(pay.basicPay, 585.02)
    assert.equal(pay.otPay, 33.72)
    assert.equal(pay.grossPay, 618.74)
  })

  it('pays salaried basic with no OT', () => {
    const pay = computeGrossPay({
      payType: 'salaried',
      salariedAmount: 1000,
      basicHours: 86.67,
      otHours: 4,
      hourlyRate: 6.75
    })
    assert.equal(pay.basicPay, 1000)
    assert.equal(pay.otPay, 0)
    assert.equal(pay.grossPay, 1000)
  })

  it('skips salaried pay without counting the skip marker as earnings', () => {
    const pay = computeGrossPay({
      payType: 'salaried',
      salariedAmount: 3000,
      extraLines: [
        { label: '__skipSalary', amount: 0 },
        { label: 'Extra', amount: 50 }
      ]
    })
    assert.equal(pay.basicPay, 0)
    assert.equal(pay.extraPay, 50)
    assert.equal(pay.grossPay, 50)
  })

  it('adds optional extra earnings only when present', () => {
    const pay = computeGrossPay({
      payType: 'hourly',
      basicHours: 40,
      otHours: 0,
      hourlyRate: 10,
      extraLines: [{ label: 'Travel', amount: 25 }]
    })
    assert.equal(pay.extraPay, 25)
    assert.equal(pay.grossPay, 425)
  })

  it('infers semi-monthly from 1–15 and 16–end', () => {
    assert.equal(inferPayCycleFromRange('2026-08-01', '2026-08-15'), 'semimonthly')
    assert.equal(inferPayCycleFromRange('2026-08-16', '2026-08-31'), 'semimonthly')
    assert.equal(inferPayCycleFromRange('2026-08-03', '2026-08-07'), 'weekly')
    assert.equal(inferPayCycleFromRange('2026-08-01', '2026-08-31'), 'monthly')
    assert.equal(inferPayCycleFromRange('2026-08-31', '2026-09-13'), 'semimonthly')
    assert.equal(
      inferPayRunCycle(
        '2026-08-31',
        '2026-09-13',
        [{ staffId: 'h1', staffName: 'Althea Frank', transTtl: 90, payCycle: 'semimonthly' }],
        []
      ),
      'semimonthly'
    )
  })

  it('includes matching-cycle hours and salaried staff; skips other cycles', () => {
    const lines = buildPayRunLines({
      cycle: 'semimonthly',
      hoursRows: [
        { staffId: 'h1', staffName: 'Althea Frank', transTtl: 90, shortage: 12, payCycle: 'semimonthly' },
        { staffId: 'm1', staffName: 'Marjorie Poleon', transTtl: 40, payCycle: 'monthly' }
      ],
      staff: [
        {
          id: 'h1',
          name: 'Althea Frank',
          status: 'active',
          role: 'cashier',
          nicNumber: '289864',
          payCycle: 'semimonthly',
          payType: 'hourly',
          hourlyRate: 6.75,
          salariedAmount: null,
          staffLoan: 40,
          medicalAmount: 10
        },
        {
          id: 'm1',
          name: 'Marjorie Poleon',
          status: 'active',
          role: 'cashier',
          nicNumber: '250987',
          payCycle: 'monthly',
          payType: 'salaried',
          hourlyRate: null,
          salariedAmount: 1021.36,
          staffLoan: null,
          medicalAmount: null
        },
        {
          id: 'j1',
          name: 'Jovita Henry',
          status: 'active',
          role: 'cashier',
          nicNumber: '266258',
          payCycle: 'semimonthly',
          payType: 'salaried',
          hourlyRate: null,
          salariedAmount: 1000,
          staffLoan: null,
          medicalAmount: null
        }
      ]
    })
    assert.equal(lines.length, 2)
    assert.equal(lines[0]?.staffName, 'Althea Frank')
    assert.equal(lines[0]?.otHours, 3.33)
    assert.equal(lines[0]?.shortageReady, 12)
    assert.equal(lines[0]?.nisEmployee, 30.94)
    assert.equal(lines[0]?.staffLoan, 40)
    assert.equal(lines[0]?.medical, 10)
    assert.equal(lines[0]?.netPay, 525.8)
    assert.equal(lines[1]?.staffName, 'Jovita Henry')
    assert.equal(lines[1]?.grossPay, 1000)
    assert.equal(lines[1]?.nisEmployee, 50)
    assert.equal(lines[1]?.netPay, 950)
    assert.equal(
      payPeriodSourceHash([
        { staffId: 'a', transTtl: 1 },
        { staffId: 'b', transTtl: 2 }
      ]),
      payPeriodSourceHash([
        { staffId: 'b', transTtl: 2 },
        { staffId: 'a', transTtl: 1 }
      ])
    )
  })

  it('caps NIS using amounts already taken this month', () => {
    const lines = buildPayRunLines({
      cycle: 'semimonthly',
      hoursRows: [{ staffId: 'h1', staffName: 'Althea Frank', transTtl: 90, payCycle: 'semimonthly' }],
      staff: [
        {
          id: 'h1',
          name: 'Althea Frank',
          status: 'active',
          role: 'cashier',
          nicNumber: '289864',
          payCycle: 'semimonthly',
          payType: 'hourly',
          hourlyRate: 6.75,
          salariedAmount: null,
          staffLoan: 0,
          medicalAmount: 0
        }
      ],
      nisTakenByStaffId: { h1: { employee: 240, employer: 240 } }
    })
    assert.equal(lines[0]?.nisEmployee, 10)
    assert.equal(lines[0]?.nisEmployer, 10)
    assert.equal(lines[0]?.netPay, 608.74)
  })
})
