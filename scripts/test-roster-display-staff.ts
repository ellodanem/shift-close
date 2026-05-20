import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  displayStaffForWeek,
  staffStartedOnOrBeforeWeek,
  weekStartMondayFromDate,
  type RosterEntryClient,
  type RosterStaffClient
} from '../lib/roster-week-client'

function staff(
  overrides: Partial<RosterStaffClient> & Pick<RosterStaffClient, 'id'>
): RosterStaffClient {
  return {
    name: overrides.id,
    status: 'active',
    role: 'cashier',
    ...overrides
  }
}

describe('weekStartMondayFromDate', () => {
  it('returns the same date when picked day is Monday', () => {
    assert.equal(weekStartMondayFromDate('2026-04-13'), '2026-04-13')
  })

  it('snaps mid-week picks to that week’s Monday', () => {
    assert.equal(weekStartMondayFromDate('2026-04-15'), '2026-04-13')
  })

  it('snaps Sunday picks to the Monday of that calendar week', () => {
    assert.equal(weekStartMondayFromDate('2026-04-19'), '2026-04-13')
  })
})

describe('staffStartedOnOrBeforeWeek', () => {
  it('includes staff with no start date', () => {
    assert.equal(staffStartedOnOrBeforeWeek(staff({ id: 'a' }), '2026-05-12'), true)
  })

  it('excludes staff who start after the viewed week', () => {
    const s = staff({ id: 'new', startDate: '2026-05-19' })
    assert.equal(staffStartedOnOrBeforeWeek(s, '2026-05-12'), false)
  })

  it('includes staff who start during the viewed week', () => {
    const s = staff({ id: 'mid', startDate: '2026-05-14' })
    assert.equal(staffStartedOnOrBeforeWeek(s, '2026-05-12'), true)
  })
})

describe('displayStaffForWeek', () => {
  const weekStart = '2026-05-12'
  const pastWeekStart = '2026-04-07'

  it('omits new hires from a past week even when active', () => {
    const all = [
      staff({ id: 'old', startDate: '2025-01-01' }),
      staff({ id: 'new', startDate: '2026-05-19' })
    ]
    const rows = displayStaffForWeek(all, pastWeekStart, [])
    assert.deepEqual(
      rows.map((s) => s.id),
      ['old']
    )
  })

  it('keeps archived staff on a past week when they have saved entries', () => {
    const all = [
      staff({ id: 'karen', status: 'inactive', startDate: '2025-01-01' }),
      staff({ id: 'other', startDate: '2025-01-01' })
    ]
    const entries: RosterEntryClient[] = [
      { staffId: 'karen', date: '2026-04-08', shiftTemplateId: 'shift-1' }
    ]
    const rows = displayStaffForWeek(all, pastWeekStart, entries)
    assert.equal(rows.some((s) => s.id === 'karen'), true)
    assert.equal(rows.some((s) => s.id === 'other'), true)
  })

  it('does not show inactive staff on past weeks without entries', () => {
    const all = [staff({ id: 'gone', status: 'inactive', startDate: '2025-01-01' })]
    const rows = displayStaffForWeek(all, pastWeekStart, [])
    assert.equal(rows.length, 0)
  })

  it('omits future starters from the current week roster', () => {
    const all = [
      staff({ id: 'now', startDate: '2026-05-01' }),
      staff({ id: 'later', startDate: '2026-05-19' })
    ]
    const rows = displayStaffForWeek(all, weekStart, [])
    assert.deepEqual(
      rows.map((s) => s.id),
      ['now']
    )
  })
})
