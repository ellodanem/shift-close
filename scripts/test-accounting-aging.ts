import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { agingFromLines } from '../lib/accounting-types'

describe('receivable aging', () => {
  it('clears the oldest charge first and buckets what remains', () => {
    const buckets = agingFromLines(
      [
        { date: '2026-01-01', lineType: 'charge', amount: 100 },
        { date: '2026-08-01', lineType: 'charge', amount: 40 },
        { date: '2026-09-01', lineType: 'payment', amount: 100 },
        { date: '2026-09-20', lineType: 'charge', amount: 15 }
      ],
      '2026-09-30'
    )
    assert.equal(buckets.total, 55)
    assert.equal(buckets.d0_30, 15)
    assert.equal(buckets.d31_60, 40)
    assert.equal(buckets.d90, 0)
  })

  it('ignores activity after the as-of date', () => {
    const buckets = agingFromLines(
      [
        { date: '2026-09-01', lineType: 'charge', amount: 20 },
        { date: '2026-10-05', lineType: 'payment', amount: 20 }
      ],
      '2026-09-30'
    )
    assert.equal(buckets.total, 20)
  })
})
