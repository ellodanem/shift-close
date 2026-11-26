import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calculateShiftClose, parseShiftDeposits, sumShiftDeposits } from '../lib/calculations'
import type { ShiftCloseInput } from '../lib/types'

const base = (): ShiftCloseInput => ({
  date: '2026-11-24',
  shift: '6-1',
  supervisor: 'Althea Frank',
  systemCash: 0,
  systemChecks: 0,
  systemCredit: 0,
  systemDebit: 0,
  otherCredit: 0,
  systemInhouse: 0,
  systemFleet: 0,
  systemMassyCoupons: 0,
  countCash: 0,
  countChecks: 0,
  countCredit: 0,
  countInhouse: 0,
  countFleet: 0,
  countMassyCoupons: 0,
  unleaded: 0,
  diesel: 0,
  deposits: [],
  notes: ''
})

describe('shift deposit totals', () => {
  it('sums deposit lines from an array or the database JSON string', () => {
    assert.equal(sumShiftDeposits([12701.88]), 12701.88)
    assert.equal(sumShiftDeposits('[17469.73,2731.24]'), 20200.97)
    assert.equal(sumShiftDeposits('["12473.33"]'), 12473.33)
    assert.deepEqual(parseShiftDeposits('[18704.86,3381.95]'), [18704.86, 3381.95])
  })

  it('does not treat a filled deposits JSON as zero', () => {
    const calculated = calculateShiftClose({
      ...base(),
      deposits: '[12701.88]' as unknown as number[]
    })
    assert.equal(calculated.totalDeposits, 12701.88)
  })
})
