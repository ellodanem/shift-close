import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { slipTasksForDay, slipsStillNeeded } from '../lib/day-slip-tasks'
import type { DayReport } from '../lib/types'

function day(partial: Partial<DayReport> = {}): DayReport {
  return {
    date: '2026-09-26',
    dayType: 'Standard',
    status: 'Complete',
    shifts: [],
    totals: {
      overShortTotal: 0,
      overShortDisclosedTotal: null,
      totalDeposits: 34428.2,
      totalCredit: 10453.25,
      totalDebit: 1488.44,
      systemCashTotal: 0,
      countCashTotal: 0,
      totalUnleaded: 0,
      totalDiesel: 0
    },
    depositScans: [],
    debitScans: [],
    securityScans: [],
    ...partial
  }
}

describe('slip tasks for an end of day', () => {
  it('asks for deposit, card, and security when money left the station', () => {
    const tasks = slipTasksForDay(day())
    assert.deepEqual(
      tasks.map((task) => task.id),
      ['deposit', 'debit', 'security']
    )
    assert.equal(slipsStillNeeded(day()), 3)
  })

  it('treats one photo in each pile as enough', () => {
    const filed = day({
      depositScans: ['/dep.pdf'],
      debitScans: ['/card.pdf'],
      securityScans: ['/sec.pdf']
    })
    assert.equal(slipsStillNeeded(filed), 0)
    assert.equal(slipTasksForDay(filed).every((task) => task.done), true)
  })

  it('accepts a card or security exception when there is no photo', () => {
    const filed = day({
      depositScans: ['/dep.pdf'],
      debitScanWaived: true,
      securityScanWaived: true
    })
    assert.equal(slipsStillNeeded(filed), 0)
    const debit = slipTasksForDay(filed).find((task) => task.id === 'debit')
    assert.equal(debit?.waived, true)
  })

  it('keeps the deposit row open while a missing-slip alert is open', () => {
    const open = day({
      depositScans: ['/dep.pdf'],
      debitScans: ['/card.pdf'],
      securityScans: ['/sec.pdf'],
      missingDepositSlipAlertOpen: true
    })
    assert.equal(slipsStillNeeded(open), 1)
    assert.equal(slipTasksForDay(open)[0].done, false)
  })

  it('counts a missing or destroyed deposit slip as filed when the alert is closed', () => {
    const filed = day({
      depositSlipUnavailableReason: 'missing',
      debitScans: ['/card.pdf'],
      securityScanWaived: true
    })
    assert.equal(slipsStillNeeded(filed), 0)
    assert.equal(slipTasksForDay(filed)[0].waived, true)
  })

  it('skips rows when that kind of money is zero', () => {
    const depositsOnly = day({
      totals: {
        ...day().totals,
        totalCredit: 0,
        totalDebit: 0
      }
    })
    assert.deepEqual(
      slipTasksForDay(depositsOnly).map((task) => task.id),
      ['deposit', 'security']
    )

    const quiet = day({
      totals: {
        ...day().totals,
        totalDeposits: 0,
        totalCredit: 0,
        totalDebit: 0
      }
    })
    assert.equal(slipTasksForDay(quiet).length, 0)
    assert.equal(slipsStillNeeded(quiet), 0)
  })
})
