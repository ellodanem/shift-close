import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUSINESS_TIME_ZONE,
  addCalendarDaysYmd,
  businessTodayYmd,
  normalizeToUtcString,
  toYmdInBusinessTz,
  ymdToUtcNoonDate,
  zonedEndExclusiveUtc,
  zonedStartOfDayUtc
} from '../lib/datetime-policy'

describe('datetime policy', () => {
  it('uses fixed business timezone', () => {
    assert.equal(BUSINESS_TIME_ZONE, 'America/St_Lucia')
  })

  it('normalizes naive datetime strings to UTC', () => {
    assert.equal(normalizeToUtcString('2026-05-05T10:30:00'), '2026-05-05T10:30:00Z')
    assert.equal(normalizeToUtcString('2026-05-05'), '2026-05-05')
  })

  it('keeps date-only values stable via UTC noon', () => {
    const d = ymdToUtcNoonDate('2026-05-29')
    assert.equal(d.toISOString(), '2026-05-29T12:00:00.000Z')
  })

  it('computes zoned day window with exclusive end', () => {
    const start = zonedStartOfDayUtc('2026-05-05')
    const end = zonedEndExclusiveUtc('2026-05-05')
    assert.equal(end.getTime() > start.getTime(), true)
    assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000)
  })

  it('adds calendar days in business timezone', () => {
    assert.equal(addCalendarDaysYmd('2026-05-05', 1), '2026-05-06')
    assert.equal(addCalendarDaysYmd('2026-05-01', -1), '2026-04-30')
  })

  it('derives business-day ymd from an instant', () => {
    const instant = new Date('2026-05-05T03:00:00.000Z')
    assert.equal(toYmdInBusinessTz(instant), '2026-05-04')
  })

  it('returns today ymd in business timezone', () => {
    const today = businessTodayYmd(new Date('2026-05-05T03:00:00.000Z'))
    assert.equal(today, '2026-05-04')
  })
})
