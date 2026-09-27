import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cashbookBehindMessage,
  summarizeDepositsOnLatestDate,
  summarizeLatestExpense
} from '../lib/cashbook-latest'
import {
  findLastClosedShiftDate,
  isShiftDayClosed,
  sumClosedDayMoney,
  weekdayNameFromYmd
} from '../lib/last-closed-day'

describe('last closed shift day', () => {
  it('treats a single Sunday shift as a closed day', () => {
    assert.equal(
      isShiftDayClosed([{ date: '2026-09-27', shift: '7:30 - 2', status: 'closed' }]),
      true
    )
    assert.equal(weekdayNameFromYmd('2026-09-27'), 'Sunday')
  })

  it('requires both weekday shifts and ignores a later draft day', () => {
    const shifts = [
      { date: '2026-09-26', shift: '6-1', status: 'closed' },
      { date: '2026-09-26', shift: '1-9', status: 'reviewed' },
      { date: '2026-09-27', shift: '7:30 - 2', status: 'draft' },
      { date: '2026-09-28', shift: '6-1', status: 'closed' }
    ]
    assert.equal(findLastClosedShiftDate(shifts, '2026-09-27'), '2026-09-26')
    assert.equal(
      isShiftDayClosed([
        { date: '2026-09-28', shift: '6-1', status: 'closed' },
        { date: '2026-09-28', shift: '1-9', status: 'closed' }
      ]),
      true
    )
    assert.equal(
      isShiftDayClosed([{ date: '2026-09-28', shift: '6-1', status: 'closed' }]),
      false
    )
  })

  it('rejects a mix of the Sunday shift and a standard shift', () => {
    assert.equal(
      isShiftDayClosed([
        { date: '2026-09-27', shift: '7:30 - 2', status: 'closed' },
        { date: '2026-09-27', shift: '6-1', status: 'closed' }
      ]),
      false
    )
  })

  it('sums deposits, debit, and credit for the closed day', () => {
    const money = sumClosedDayMoney([
      {
        date: '2026-09-27',
        shift: '7:30 - 2',
        status: 'closed',
        deposits: '[100, 40]',
        systemDebit: 25,
        otherCredit: 10,
        overShortTotal: -5,
        osReviewed: null,
        osLegitAsIs: false
      }
    ])
    assert.equal(money.deposits, 140)
    assert.equal(money.debit, 25)
    assert.equal(money.credit, 10)
    assert.equal(money.overShort, -5)
  })
})

describe('cashbook latest', () => {
  it('groups every deposit line on the latest deposit date', () => {
    const deposit = summarizeDepositsOnLatestDate([
      {
        date: '2026-09-26',
        description: 'Deposit',
        createdAt: '2026-09-26T12:00:00.000Z',
        paymentMethod: null,
        allocations: [{ amount: 80, category: { type: 'income', name: 'Deposit' } }]
      },
      {
        date: '2026-09-27',
        description: 'Deposit',
        createdAt: '2026-09-27T12:00:00.000Z',
        paymentMethod: null,
        allocations: [{ amount: 50, category: { type: 'income', name: 'Deposit' } }]
      },
      {
        date: '2026-09-27',
        description: 'Deposit',
        createdAt: '2026-09-27T13:00:00.000Z',
        paymentMethod: null,
        allocations: [{ amount: 20, category: { type: 'income', name: 'Deposit' } }]
      }
    ])
    assert.equal(deposit?.date, '2026-09-27')
    assert.equal(deposit?.amount, 70)
    assert.equal(deposit?.lineCount, 2)
  })

  it('picks the latest expense and says when the book is behind the closed day', () => {
    const expense = summarizeLatestExpense([
      {
        date: '2026-09-20',
        description: 'Utilities',
        createdAt: '2026-09-20T12:00:00.000Z',
        paymentMethod: 'eft',
        allocations: [{ amount: 40, category: { type: 'expense', name: 'Utilities' } }]
      },
      {
        date: '2026-09-25',
        description: 'Bank charges',
        createdAt: '2026-09-25T15:00:00.000Z',
        paymentMethod: 'direct_debit',
        allocations: [{ amount: 12.5, category: { type: 'expense', name: 'Bank charges' } }]
      }
    ])
    assert.equal(expense?.description, 'Bank charges')
    assert.equal(expense?.amount, 12.5)
    assert.equal(expense?.paymentLabel, 'Direct debit')
    assert.match(cashbookBehindMessage('2026-09-26', '2026-09-27') ?? '', /Sunday/)
    assert.equal(cashbookBehindMessage('2026-09-27', '2026-09-27'), null)
  })
})