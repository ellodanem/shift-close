import test from 'node:test'
import assert from 'node:assert/strict'
import { eligibleSaveDates } from '../lib/cstore-save-eligibility'

test('eligibleSaveDates keeps only Complete days before today, oldest first', () => {
  const days = [
    { date: '2026-11-10', status: 'Complete' },
    { date: '2026-11-09', status: 'Complete' },
    { date: '2026-11-08', status: 'Incomplete' },
    { date: '2026-11-07', status: 'Invalid mix' },
    { date: '2026-11-06', status: 'Complete' }
  ]
  assert.deepEqual(eligibleSaveDates(days, '2026-11-10'), ['2026-11-06', '2026-11-09'])
  assert.deepEqual(eligibleSaveDates(days, '2026-11-09'), ['2026-11-06'])
})
