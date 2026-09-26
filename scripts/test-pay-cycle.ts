import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_PAY_CYCLE,
  PAY_CYCLE_HOUR_CAPS,
  parseCycleNumber,
  parsePayCycle,
  payPeriodCycleNumber,
  splitPayPeriodHours
} from '../lib/pay-cycle'
import { buildPayPeriodTimeListAoA, buildPayPeriodWorksheetAoA } from '../lib/pay-period-excel'

describe('pay cycle hours split', () => {
  it('numbers a September 1–15 period as cycle 17', () => {
    assert.equal(payPeriodCycleNumber('2025-09-15'), '17')
    assert.equal(payPeriodCycleNumber('2026-05-15'), '9')
    assert.equal(payPeriodCycleNumber('2026-05-31'), '10')
    assert.equal(parseCycleNumber(undefined, '2025-09-15'), 17)
    assert.equal(parseCycleNumber(18, '2025-09-15'), 18)
    assert.equal(parseCycleNumber(0, '2025-09-15'), null)
  })

  it('defaults unknown cycles to semi-monthly', () => {
    assert.equal(parsePayCycle(undefined), DEFAULT_PAY_CYCLE)
    assert.equal(parsePayCycle('Bi-monthly'), DEFAULT_PAY_CYCLE)
    assert.equal(parsePayCycle('semimonthly'), 'semimonthly')
  })

  it('splits 90 hours on the Pay+ semi-monthly cap', () => {
    const split = splitPayPeriodHours(90)
    assert.equal(split.cap, 86.67)
    assert.equal(split.basicHours, 86.67)
    assert.equal(split.otHours, 3.33)
  })

  it('keeps hours at or under the cap as basic only', () => {
    assert.deepEqual(splitPayPeriodHours(86.67), {
      cycle: 'semimonthly',
      cap: 86.67,
      basicHours: 86.67,
      otHours: 0
    })
    assert.equal(splitPayPeriodHours(40, 'weekly').otHours, 0)
    assert.equal(splitPayPeriodHours(80, 'biweekly').otHours, 0)
    assert.equal(splitPayPeriodHours(173.33, 'monthly').otHours, 0)
  })

  it('uses each cycle’s overtime cap', () => {
    assert.equal(splitPayPeriodHours(45, 'weekly').basicHours, 40)
    assert.equal(splitPayPeriodHours(45, 'weekly').otHours, 5)
    assert.equal(splitPayPeriodHours(90, 'biweekly').basicHours, 80)
    assert.equal(splitPayPeriodHours(90, 'biweekly').otHours, 10)
    assert.equal(splitPayPeriodHours(200, 'monthly').basicHours, PAY_CYCLE_HOUR_CAPS.monthly)
    assert.equal(splitPayPeriodHours(200, 'monthly').otHours, 26.67)
  })

  it('treats missing or negative hours as zero', () => {
    assert.deepEqual(splitPayPeriodHours(Number.NaN), {
      cycle: 'semimonthly',
      cap: 86.67,
      basicHours: 0,
      otHours: 0
    })
    assert.equal(splitPayPeriodHours(-4, 'weekly').basicHours, 0)
    assert.equal(splitPayPeriodHours(-4, 'weekly').otHours, 0)
  })

  it('adds Basic / OT columns and a Pay+ time list', () => {
    const data = {
      startDate: '2026-08-01',
      endDate: '2026-08-15',
      reportDate: '2026-08-15',
      entityName: 'Total Auto Service Station',
      rows: [
        {
          staffId: '1',
          staffName: 'Althea Frank',
          transTtl: 90,
          vacation: '',
          shortage: 0,
          payCycle: 'semimonthly',
          staffNo: '289864'
        }
      ]
    }
    const sheet = buildPayPeriodWorksheetAoA(data)
    const header = sheet.find((row) => row[0] === 'Staff')
    assert.ok(header)
    assert.deepEqual(header.slice(0, 5), ['Staff', 'Trans Ttl', 'Basic', 'OT', 'Cycle'])
    const staffRow = sheet.find((row) => row[0] === 'Althea Frank')
    assert.deepEqual(staffRow?.slice(1, 4), [90, 86.67, 3.33])

    const timeList = buildPayPeriodTimeListAoA(data)
    assert.deepEqual(timeList[4], ['STAFFNO', 'STAFFNAME', 'BSC', 'OTH', 'CYCLE'])
    assert.deepEqual(timeList[5], ['289864', 'Althea Frank', 86.67, 3.33, 'Semi-monthly'])
  })
})
