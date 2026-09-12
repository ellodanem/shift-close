import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { depositComparisonsPath, endOfDayPath, parseFocusDate } from '../lib/daily-close-path'

describe('daily close path', () => {
  it('accepts YYYY-MM-DD and rejects junk', () => {
    assert.equal(parseFocusDate('2026-09-10'), '2026-09-10')
    assert.equal(parseFocusDate(' 2026-09-10 '), '2026-09-10')
    assert.equal(parseFocusDate('10/09/2026'), null)
    assert.equal(parseFocusDate(''), null)
    assert.equal(parseFocusDate(null), null)
  })

  it('builds End of Day and deposit comparison URLs', () => {
    assert.equal(endOfDayPath(), '/days')
    assert.equal(endOfDayPath('2026-09-10'), '/days?date=2026-09-10')
    assert.equal(depositComparisonsPath(), '/financial/deposit-comparisons')
    assert.equal(depositComparisonsPath('2026-09-10'), '/financial/deposit-comparisons?date=2026-09-10')
    assert.equal(endOfDayPath('nope'), '/days')
  })
})
