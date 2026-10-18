import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAccountantDailyUpdates, type AccountantDailyShiftSource } from '../lib/accountant-daily-updates'

function shift(overrides: Partial<AccountantDailyShiftSource> = {}): AccountantDailyShiftSource {
  return {
    id: 'shift-1',
    date: '2026-10-16',
    shift: '6-1',
    status: 'closed',
    deposits: '[21316.83,13672.59]',
    otherCredit: 3088.22,
    systemDebit: 478.18,
    unleaded: 4100,
    diesel: 2100,
    ...overrides
  }
}

test('builds the familiar daily note from completed shifts', () => {
  const days = buildAccountantDailyUpdates([
    shift(),
    shift({
      id: 'shift-2',
      shift: '1-9',
      deposits: '[3562.50]',
      otherCredit: 5029.02,
      systemDebit: 1066.65,
      unleaded: 4389,
      diesel: 2262
    })
  ])

  assert.equal(days.length, 1)
  assert.deepEqual(days[0].deposits.map((line) => line.amount), [21316.83, 13672.59, 3562.5])
  assert.deepEqual(days[0].credits.map((line) => line.amount), [3088.22, 5029.02])
  assert.deepEqual(days[0].debits.map((line) => line.amount), [478.18, 1066.65])
  assert.equal(days[0].gasoline, 8489)
  assert.equal(days[0].diesel, 4362)
})

test('excludes drafts and accepts the future submitted state', () => {
  const days = buildAccountantDailyUpdates([
    shift({ id: 'draft', status: 'draft' }),
    shift({ id: 'submitted', status: 'submitted' })
  ])
  assert.deepEqual(days[0].shifts.map((row) => row.id), ['submitted'])
})

test('fingerprint changes when another shift completes', () => {
  const first = buildAccountantDailyUpdates([shift()])[0].fingerprint
  const second = buildAccountantDailyUpdates([shift(), shift({ id: 'shift-2', shift: '1-9' })])[0].fingerprint
  assert.notEqual(first, second)
})
