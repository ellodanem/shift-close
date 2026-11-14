import test from 'node:test'
import assert from 'node:assert/strict'
import { isPublicPath } from '../lib/access-control'
import { eligibleSaveDates } from '../lib/cstore-save-eligibility'

test('eligibleSaveDates keeps every day in the range before today, oldest first', () => {
  assert.deepEqual(eligibleSaveDates('2026-11-08', '2026-11-14', '2026-11-14'), [
    '2026-11-08',
    '2026-11-09',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13'
  ])
  assert.deepEqual(eligibleSaveDates('2026-11-08', '2026-11-14', '2026-11-09'), ['2026-11-08'])
  assert.deepEqual(eligibleSaveDates('2026-11-10', '2026-11-10', '2026-11-10'), [])
})

test('the agent eligibility API is public; status and Sync stay session-only', () => {
  assert.equal(isPublicPath('/api/harvest-agent/cstore-day-report/eligible'), true)
  assert.equal(isPublicPath('/api/harvest-agent/heartbeat'), true)
  assert.equal(isPublicPath('/api/harvest-agent/sync/claim'), true)
  assert.equal(isPublicPath('/api/harvest-agent/status'), false)
  assert.equal(isPublicPath('/api/harvest-agent/sync'), false)
})
