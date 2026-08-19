import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fromZonedTime } from 'date-fns-tz'
import { previousBiweeklyPeriodBounds } from '../lib/current-pay-period'
import { clampLateAbsentMinutes, computePresenceStatus } from '../lib/present-absence'

const TZ = 'America/St_Lucia'

describe('late / absent presence', () => {
  it('clamps late below absent', () => {
    const c = clampLateAbsentMinutes(90, 60)
    assert.equal(c.absentMinutes, 60)
    assert.equal(c.lateMinutes, 59)
  })

  it('pending before 15 minutes with no punch', () => {
    const status = computePresenceStatus({
      dateYmd: '2026-08-19',
      todayYmd: '2026-08-19',
      now: fromZonedTime('2026-08-19T07:10:00', TZ),
      lateMinutes: 15,
      absentMinutes: 60,
      shiftStartHHmm: '07:00',
      tz: TZ,
      firstPunchAt: null,
      manualPresent: false,
      isExpected: true
    })
    assert.equal(status, 'pending')
  })

  it('late with no punch after 15 minutes', () => {
    const status = computePresenceStatus({
      dateYmd: '2026-08-19',
      todayYmd: '2026-08-19',
      now: fromZonedTime('2026-08-19T07:20:00', TZ),
      lateMinutes: 15,
      absentMinutes: 60,
      shiftStartHHmm: '07:00',
      tz: TZ,
      firstPunchAt: null,
      manualPresent: false,
      isExpected: true
    })
    assert.equal(status, 'late')
  })

  it('absent with no punch after 60 minutes', () => {
    const status = computePresenceStatus({
      dateYmd: '2026-08-19',
      todayYmd: '2026-08-19',
      now: fromZonedTime('2026-08-19T08:05:00', TZ),
      lateMinutes: 15,
      absentMinutes: 60,
      shiftStartHHmm: '07:00',
      tz: TZ,
      firstPunchAt: null,
      manualPresent: false,
      isExpected: true
    })
    assert.equal(status, 'absent')
  })

  it('tardy punch after 15 minutes is late even past 60', () => {
    const status = computePresenceStatus({
      dateYmd: '2026-08-19',
      todayYmd: '2026-08-19',
      now: fromZonedTime('2026-08-19T09:00:00', TZ),
      lateMinutes: 15,
      absentMinutes: 60,
      shiftStartHHmm: '07:00',
      tz: TZ,
      firstPunchAt: fromZonedTime('2026-08-19T08:10:00', TZ),
      manualPresent: false,
      isExpected: true
    })
    assert.equal(status, 'late')
  })

  it('on-time punch is present', () => {
    const status = computePresenceStatus({
      dateYmd: '2026-08-19',
      todayYmd: '2026-08-19',
      now: fromZonedTime('2026-08-19T09:00:00', TZ),
      lateMinutes: 15,
      absentMinutes: 60,
      shiftStartHHmm: '07:00',
      tz: TZ,
      firstPunchAt: fromZonedTime('2026-08-19T07:08:00', TZ),
      manualPresent: false,
      isExpected: true
    })
    assert.equal(status, 'present')
  })

  it('past day with no punch is absent', () => {
    const status = computePresenceStatus({
      dateYmd: '2026-08-18',
      todayYmd: '2026-08-19',
      now: fromZonedTime('2026-08-19T09:00:00', TZ),
      lateMinutes: 15,
      absentMinutes: 60,
      shiftStartHHmm: '07:00',
      tz: TZ,
      firstPunchAt: null,
      manualPresent: false,
      isExpected: true
    })
    assert.equal(status, 'absent')
  })
})

describe('previous biweekly period', () => {
  it('maps 1–15 back to prior month 16–EOM', () => {
    const b = previousBiweeklyPeriodBounds(new Date(2026, 7, 10))
    assert.equal(b.periodStart, '2026-07-16')
    assert.equal(b.periodEnd, '2026-07-31')
  })

  it('maps 16–EOM back to 1–15 of same month', () => {
    const b = previousBiweeklyPeriodBounds(new Date(2026, 7, 19))
    assert.equal(b.periodStart, '2026-08-01')
    assert.equal(b.periodEnd, '2026-08-15')
  })
})
