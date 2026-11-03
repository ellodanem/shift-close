import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allCardsCleared,
  depositBankStatusOnFinish,
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
    account: partial.account ?? 'westline',
    ...partial
  }
}

describe('account register', () => {
  it('keeps only the lines that belong to the account, whatever the payment type', () => {
    const base = {
      statementEndDate: '2026-09-30',
      lockedIds: new Set(['locked']),
      clearedIds: new Set(['dep']),
      entries: [
        entry({ id: 'dep', date: '2026-09-01', description: 'Deposit', creditAmt: 200, account: 'westline' }),
        entry({
          id: 'ss-check',
          date: '2026-09-02',
          description: 'Vendor check',
          ref: '77',
          debitCheck: 40,
          account: 'service_station'
        }),
        entry({ id: 'card', date: '2026-09-03', description: 'Credit card', creditAmt: 90, account: 'service_station' }),
        entry({ id: 'wl-check', date: '2026-09-05', description: 'Check', ref: '104', debitCheck: 25, account: 'westline' }),
        entry({ id: 'later', date: '2026-10-01', description: 'Next month', creditAmt: 5, account: 'westline' }),
        entry({ id: 'locked', date: '2026-09-08', description: 'Already finished', creditAmt: 8, account: 'westline' }),
        entry({ id: 'zero', date: '2026-09-09', description: 'Empty', account: 'westline' })
      ]
    }

    const westline = listRegisterLines({ ...base, account: 'westline' })
    assert.deepEqual(westline.map((line) => line.cashbookEntryId), ['dep', 'wl-check'])
    assert.equal(westline[0].cleared, true)
    assert.equal(westline[0].deposit, 200)
    assert.equal(westline[1].withdrawal, 25)
    assert.equal(westline[1].ref, '104')

    const station = listRegisterLines({ ...base, account: 'service_station' })
    assert.deepEqual(station.map((line) => line.cashbookEntryId), ['ss-check', 'card'])
    assert.equal(station[0].withdrawal, 40)
  })

  it('puts both legs of a transfer on their own register', () => {
    const entries = [
      entry({ id: 'out', date: '2026-09-10', description: 'Transfer to Service Station', debitEcard: 500, account: 'westline' }),
      entry({ id: 'in', date: '2026-09-10', description: 'Transfer from Westline', creditAmt: 500, account: 'service_station' })
    ]
    const args = { entries, statementEndDate: '2026-09-30', lockedIds: new Set<string>(), clearedIds: new Set<string>() }
    assert.equal(listRegisterLines({ ...args, account: 'westline' })[0].withdrawal, 500)
    assert.equal(listRegisterLines({ ...args, account: 'service_station' })[0].deposit, 500)
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
