import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allCardsCleared,
  depositBankStatusOnFinish,
  isWestlineRegisterEntry,
  listRegisterLines,
  reconcileBalances,
  type RegisterSource
} from '../lib/bank-reconcile'

function entry(partial: Partial<RegisterSource> & Pick<RegisterSource, 'id' | 'date'>): RegisterSource {
  return {
    description: partial.description ?? 'Line',
    ref: partial.ref ?? null,
    creditAmt: partial.creditAmt ?? 0,
    debitCash: partial.debitCash ?? 0,
    debitCheck: partial.debitCheck ?? 0,
    debitEcard: partial.debitEcard ?? 0,
    debitDcard: partial.debitDcard ?? 0,
    vendor: partial.vendor ?? null,
    ...partial
  }
}

describe('westline register', () => {
  it('keeps ordinary cashbook lines and drops a service station vendor check', () => {
    const lines = listRegisterLines({
      statementEndDate: '2026-09-30',
      lockedIds: new Set(['locked']),
      clearedIds: new Set(['dep']),
      entries: [
        entry({ id: 'dep', date: '2026-09-01', description: 'Deposit', creditAmt: 200 }),
        entry({
          id: 'ss',
          date: '2026-09-02',
          description: 'Vendor check',
          debitCheck: 40,
          vendor: { paymentMethod: 'check', clearedAt: new Date('2026-09-03'), clearedBalanceAccount: 'service_station' }
        }),
        entry({
          id: 'open-check',
          date: '2026-09-04',
          description: 'Uncashed vendor check',
          debitCheck: 15,
          vendor: { paymentMethod: 'check', clearedAt: null, clearedBalanceAccount: null }
        }),
        entry({
          id: 'westline-check',
          date: '2026-09-05',
          description: 'Westline check',
          ref: '104',
          debitCheck: 25,
          vendor: { paymentMethod: 'check', clearedAt: new Date('2026-09-06'), clearedBalanceAccount: 'westline' }
        }),
        entry({
          id: 'eft',
          date: '2026-09-07',
          description: 'Vendor EFT',
          debitEcard: 10,
          vendor: { paymentMethod: 'eft', clearedAt: new Date('2026-09-07'), clearedBalanceAccount: null }
        }),
        entry({ id: 'later', date: '2026-10-01', description: 'Next month', creditAmt: 5 }),
        entry({ id: 'locked', date: '2026-09-08', description: 'Already finished', creditAmt: 8 }),
        entry({ id: 'zero', date: '2026-09-09', description: 'Empty' })
      ]
    })

    assert.deepEqual(
      lines.map((line) => line.cashbookEntryId),
      ['dep', 'westline-check', 'eft']
    )
    assert.equal(lines[0].cleared, true)
    assert.equal(lines[0].deposit, 200)
    assert.equal(lines[1].withdrawal, 25)
    assert.equal(lines[1].ref, '104')
    assert.equal(isWestlineRegisterEntry({ paymentMethod: 'check', clearedAt: null, clearedBalanceAccount: 'westline' }), false)
    assert.equal(
      isWestlineRegisterEntry({ paymentMethod: 'check', clearedAt: new Date('2026-09-01'), clearedBalanceAccount: null }),
      true
    )
  })

  it('leaves an outstanding check in the book balance and balances when the statement matches the ticked lines', () => {
    const totals = reconcileBalances({
      openingBalance: 1000,
      statementEndBalance: 1200,
      lines: [
        { deposit: 200, withdrawal: 0, cleared: true },
        { deposit: 0, withdrawal: 50, cleared: false }
      ]
    })
    assert.equal(totals.bookBalance, 1150)
    assert.equal(totals.clearedBalance, 1200)
    assert.equal(totals.difference, 0)
    assert.equal(totals.balanced, true)
  })

  it('stays open while the statement and the ticked lines disagree', () => {
    const totals = reconcileBalances({
      openingBalance: 1000,
      statementEndBalance: 1100,
      lines: [{ deposit: 200, withdrawal: 0, cleared: true }]
    })
    assert.equal(totals.difference, -100)
    assert.equal(totals.balanced, false)
  })

  it('keeps a discrepancy and clears the card row only when every card line is ticked', () => {
    assert.equal(depositBankStatusOnFinish('discrepancy'), null)
    assert.equal(depositBankStatusOnFinish('pending'), 'cleared')
    assert.equal(depositBankStatusOnFinish(null), 'cleared')
    assert.equal(allCardsCleared([{ cleared: true }, { cleared: false }]), false)
    assert.equal(allCardsCleared([{ cleared: true }]), true)
    assert.equal(allCardsCleared([]), false)
  })
})
