import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPayRunLines,
  computeGrossPay,
  inferPayCycleFromRange,
  inferPayRunCycle,
  payCyclesDueOnRange,
  OT_MULTIPLIER,
  parseExtraLines,
  payPeriodSourceHash,
  taxablePayFromGross
} from '../lib/pay-run'
import { vacationDaysInPeriod } from '../lib/vacation-pay'

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

  it('pays overtime at a chosen multiple of the hourly rate', () => {
    const pay = computeGrossPay({
      payType: 'hourly',
      basicHours: 86.67,
      otHours: 3.33,
      hourlyRate: 6.75,
      otMultiplier: 2
    })
    assert.equal(pay.basicPay, 585.02)
    assert.equal(pay.otPay, 44.96)
    assert.equal(pay.grossPay, 629.98)
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

  it('pays salaried amount and ignores a leftover skip marker', () => {
    const pay = computeGrossPay({
      payType: 'salaried',
      salariedAmount: 3000,
      extraLines: [
        { label: '__skipSalary', amount: 0 },
        { label: 'Extra', amount: 50 }
      ]
    })
    assert.equal(pay.basicPay, 3000)
    assert.equal(pay.extraPay, 50)
    assert.equal(pay.grossPay, 3050)
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

  it('pays monthly staff on the 16th–end run, including a manager', () => {
    assert.deepEqual(payCyclesDueOnRange('2026-09-01', '2026-09-15'), ['semimonthly'])
    assert.deepEqual(payCyclesDueOnRange('2026-09-16', '2026-09-30'), ['semimonthly', 'monthly'])
    assert.deepEqual(payCyclesDueOnRange('2026-02-16', '2026-02-28'), ['semimonthly', 'monthly'])
    assert.deepEqual(payCyclesDueOnRange('2026-09-01', '2026-09-30'), ['monthly'])

    const lines = buildPayRunLines({
      cycle: 'semimonthly',
      periodStart: '2026-09-16',
      periodEnd: '2026-09-30',
      hoursRows: [{ staffId: 'h1', staffName: 'Althea Frank', transTtl: 80, payCycle: 'semimonthly' }],
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
          staffLoan: null,
          medicalAmount: null
        },
        {
          id: 'm1',
          name: 'Marjorie Poleon',
          status: 'active',
          role: 'manager',
          nicNumber: '250987',
          payCycle: 'monthly',
          payType: 'salaried',
          hourlyRate: null,
          salariedAmount: 3200,
          staffLoan: null,
          medicalAmount: null
        }
      ]
    })
    assert.deepEqual(
      lines.map((line) => line.staffName),
      ['Althea Frank', 'Marjorie Poleon']
    )
    const marjorie = lines.find((line) => line.staffId === 'm1')
    assert.equal(marjorie?.payCycle, 'monthly')
    assert.equal(marjorie?.grossPay, 3200)
  })

  it('keeps monthly staff off the 1st–15th run', () => {
    const lines = buildPayRunLines({
      cycle: 'semimonthly',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-15',
      hoursRows: [],
      staff: [
        {
          id: 'm1',
          name: 'Marjorie Poleon',
          status: 'active',
          role: 'manager',
          nicNumber: '250987',
          payCycle: 'monthly',
          payType: 'salaried',
          hourlyRate: null,
          salariedAmount: 3200,
          staffLoan: null,
          medicalAmount: null
        }
      ]
    })
    assert.equal(lines.length, 0)
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
    assert.equal(lines[0]?.paye, 0)
    assert.equal(lines[0]?.netPay, 608.74)
  })

  it('leaves an untaxed extra out of PAYE', () => {
    const lines = parseExtraLines([{ label: 'Travel', amount: 500, taxable: false }, { label: 'Extra', amount: 20 }])
    assert.equal(lines[0]?.taxable, false)
    assert.equal(taxablePayFromGross(3800, lines), 3300)
    const built = buildPayRunLines({
      cycle: 'monthly',
      hoursRows: [],
      staff: [
        {
          id: 'm1',
          name: 'Marjorie Poleon',
          status: 'active',
          role: 'cashier',
          nicNumber: '250987',
          payCycle: 'monthly',
          payType: 'salaried',
          hourlyRate: null,
          salariedAmount: 3300,
          staffLoan: null,
          medicalAmount: null
        }
      ],
      extrasByStaffId: { m1: [{ label: 'Travel', amount: 500, taxable: false }] }
    })
    assert.equal(built[0]?.grossPay, 3800)
    assert.equal(built[0]?.nisEmployee, 190)
    assert.equal(built[0]?.paye, 91.5)
    assert.equal(built[0]?.netPay, 3518.5)
  })

  it('counts vacation days that fall inside the pay period', () => {
    assert.equal(vacationDaysInPeriod('2026-09-01', '2026-09-18', '2026-09-01', '2026-09-15'), 15)
    assert.equal(vacationDaysInPeriod('2026-09-01', '2026-09-18', '2026-09-16', '2026-09-30'), 3)
    assert.equal(vacationDaysInPeriod('2026-09-10', '2026-09-12', '2026-09-01', '2026-09-15'), 3)
  })

  it('pays hourly vacation at 6 hours a day and still takes NIS and medical', () => {
    const pay = computeGrossPay({
      payType: 'hourly',
      basicHours: 0,
      hourlyRate: 10,
      vacationDays: 18,
      vacationHoursPerDay: 6
    })
    assert.equal(pay.vacationHours, 108)
    assert.equal(pay.vacationPay, 1080)
    assert.equal(pay.grossPay, 1080)

    const lines = buildPayRunLines({
      cycle: 'semimonthly',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-15',
      vacationHoursPerDay: 6,
      hoursRows: [{ staffId: 'h1', staffName: 'Althea Frank', transTtl: 40, payCycle: 'semimonthly' }],
      staff: [
        {
          id: 'h1',
          name: 'Althea Frank',
          status: 'active',
          role: 'cashier',
          nicNumber: '289864',
          payCycle: 'semimonthly',
          payType: 'hourly',
          hourlyRate: 10,
          salariedAmount: null,
          staffLoan: 0,
          medicalAmount: 5,
          vacationStart: '2026-09-10',
          vacationEnd: '2026-09-12'
        },
        {
          id: 's1',
          name: 'Jovita Henry',
          status: 'active',
          role: 'cashier',
          nicNumber: '266258',
          payCycle: 'semimonthly',
          payType: 'salaried',
          hourlyRate: null,
          salariedAmount: 1000,
          staffLoan: null,
          medicalAmount: null,
          vacationStart: '2026-09-01',
          vacationEnd: '2026-09-15'
        }
      ]
    })
    const hourly = lines.find((line) => line.staffId === 'h1')
    const salaried = lines.find((line) => line.staffId === 's1')
    assert.equal(hourly?.vacationDays, 3)
    assert.equal(hourly?.vacationHours, 18)
    assert.equal(hourly?.vacationPay, 180)
    assert.equal(hourly?.basicPay, 400)
    assert.equal(hourly?.grossPay, 580)
    assert.equal(hourly?.nisEmployee, 29)
    assert.equal(hourly?.medical, 5)
    assert.equal(hourly?.netPay, 546)
    assert.equal(salaried?.vacationPay, 0)
    assert.equal(salaried?.grossPay, 1000)
  })
})
