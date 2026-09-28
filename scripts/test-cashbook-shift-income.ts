import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  shiftCardIncomeLines,
  shouldSyncCardIncomeAfterShiftUpdate
} from '../lib/cashbook-shift-income'

describe('closed shift credit and debit income', () => {
  it('books credit and debit as card income and drops zeros', () => {
    const lines = shiftCardIncomeLines({ otherCredit: 120.5, systemDebit: 40 })
    assert.deepEqual(
      lines.map((line) => ({ kind: line.kind, categoryName: line.categoryName, amount: line.amount })),
      [
        { kind: 'credit', categoryName: 'Credit Card', amount: 120.5 },
        { kind: 'debit', categoryName: 'Debit Card', amount: 40 }
      ]
    )
    assert.equal(lines.every((line) => line.description === 'Card Transactions'), true)
    assert.deepEqual(shiftCardIncomeLines({ otherCredit: 0, systemDebit: 15 }).map((line) => line.kind), [
      'debit'
    ])
  })

  it('syncs when a closed shift credit or debit changes, and when the shift is first closed', () => {
    assert.equal(shouldSyncCardIncomeAfterShiftUpdate('closed', 'closed', true), true)
    assert.equal(shouldSyncCardIncomeAfterShiftUpdate('draft', 'closed', false), true)
    assert.equal(shouldSyncCardIncomeAfterShiftUpdate('closed', 'closed', false), false)
    assert.equal(shouldSyncCardIncomeAfterShiftUpdate('draft', 'draft', true), false)
  })
})
