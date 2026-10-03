import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  currentHarvestSyncMonth,
  harvestSyncMonthLabel,
  isHarvestSyncTaskKey,
  previousHarvestSyncMonth
} from '../lib/harvest-sync'

describe('harvest sync month', () => {
  it('labels a calendar month', () => {
    assert.equal(harvestSyncMonthLabel(2026, 10), 'October 2026')
  })

  it('uses the St. Lucia calendar month', () => {
    const month = currentHarvestSyncMonth(new Date('2026-10-03T03:30:00.000Z'))
    assert.deepEqual(month, { year: 2026, month: 10 })
  })

  it('rolls to the next St. Lucia month after midnight there', () => {
    const month = currentHarvestSyncMonth(new Date('2026-11-01T04:30:00.000Z'))
    assert.deepEqual(month, { year: 2026, month: 11 })
  })

  it('steps back one calendar month', () => {
    assert.deepEqual(previousHarvestSyncMonth(2026, 10), { year: 2026, month: 9 })
    assert.deepEqual(previousHarvestSyncMonth(2026, 1), { year: 2025, month: 12 })
  })

  it('accepts only the four sync jobs', () => {
    assert.equal(isHarvestSyncTaskKey('customer_accounts'), true)
    assert.equal(isHarvestSyncTaskKey('cstore_keepalive'), false)
  })
})
