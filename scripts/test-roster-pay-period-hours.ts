import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPayPeriodHoursByStaff,
  formatRosterHours,
  hoursFromShiftTimes,
  payPeriodHoursTitle,
  payPeriodHoursTone,
  resolveOpenPayPeriodStart
} from '../lib/roster-pay-period-hours'

describe('roster pay period hours', () => {
  it('computes daytime and overnight shift lengths', () => {
    assert.equal(hoursFromShiftTimes('06:00', '13:00'), 7)
    assert.equal(hoursFromShiftTimes('18:00', '01:00'), 7)
    assert.equal(hoursFromShiftTimes('22:30', '06:00'), 7.5)
    assert.equal(hoursFromShiftTimes('06:00', '06:00'), 0)
    assert.equal(hoursFromShiftTimes('bad', '13:00'), 0)
  })

  it('starts the open period the day after the last extracted end', () => {
    assert.equal(
      resolveOpenPayPeriodStart({
        lastPeriodEndDate: '2026-08-12',
        todayYmd: '2026-08-14',
        weekEndYmd: '2026-08-16'
      }),
      '2026-08-13'
    )
  })

  it('falls back to the first of the month when nothing is extracted', () => {
    assert.equal(
      resolveOpenPayPeriodStart({
        lastPeriodEndDate: null,
        todayYmd: '2026-08-14',
        weekEndYmd: '2026-08-16'
      }),
      '2026-08-01'
    )
  })

  it('caps a very old open period lookback', () => {
    assert.equal(
      resolveOpenPayPeriodStart({
        lastPeriodEndDate: '2025-01-01',
        todayYmd: '2026-08-14',
        weekEndYmd: '2026-08-16',
        maxDays: 10
      }),
      '2026-08-07'
    )
  })

  it('sums scheduled hours in the open period and this week', () => {
    const templates = new Map([
      ['am', { startTime: '06:00', endTime: '14:00' }],
      ['pm', { startTime: '14:00', endTime: '22:00' }]
    ])
    const hours = buildPayPeriodHoursByStaff({
      staffIds: ['s1'],
      periodStart: '2026-08-13',
      periodEnd: '2026-08-23',
      weekStart: '2026-08-17',
      weekEnd: '2026-08-23',
      templatesById: templates,
      entries: [
        { staffId: 's1', date: '2026-08-12', shiftTemplateId: 'am' },
        { staffId: 's1', date: '2026-08-13', shiftTemplateId: 'am' },
        { staffId: 's1', date: '2026-08-18', shiftTemplateId: 'pm' },
        { staffId: 's1', date: '2026-08-19', shiftTemplateId: null }
      ]
    })
    const row = hours.get('s1')
    assert.ok(row)
    assert.equal(row.periodHours, 16)
    assert.equal(row.weekHours, 8)
  })

  it('skips vacation/sick/closed days and formats the badge', () => {
    const templates = new Map([['am', { startTime: '06:00', endTime: '14:00' }]])
    const hours = buildPayPeriodHoursByStaff({
      staffIds: ['s1'],
      periodStart: '2026-08-13',
      periodEnd: '2026-08-16',
      weekStart: '2026-08-10',
      weekEnd: '2026-08-16',
      templatesById: templates,
      zeroHourKeys: new Set(['s1|2026-08-14']),
      entries: [
        { staffId: 's1', date: '2026-08-13', shiftTemplateId: 'am' },
        { staffId: 's1', date: '2026-08-14', shiftTemplateId: 'am' }
      ]
    })
    assert.equal(hours.get('s1')?.periodHours, 8)
    assert.equal(formatRosterHours(32), '32h')
    assert.equal(formatRosterHours(32.5), '32.5h')
    assert.equal(payPeriodHoursTone(32), 'under')
    assert.equal(payPeriodHoursTone(72), 'on_track')
    assert.equal(payPeriodHoursTone(88), 'over')
    assert.match(
      payPeriodHoursTitle({ periodStart: '2026-08-13', periodHours: 32, weekHours: 28 }),
      /13 Aug/
    )
  })
})
