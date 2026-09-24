import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildComparisonRowsFromShifts, type ShiftWithDepositRecords } from '../lib/deposit-comparison-rows'

function shift(partial: {
  id: string
  date: string
  shift: string
  supervisor?: string
  deposits?: string
  systemDebit?: number
  otherCredit?: number
  debitScanUrls?: string
  bankStatus?: string
}): ShiftWithDepositRecords {
  const depositRecords = partial.bankStatus
    ? [
        {
          id: `rec-${partial.id}`,
          shiftId: partial.id,
          recordKind: 'debit',
          lineIndex: 0,
          bankStatus: partial.bankStatus,
          notes: '',
          securitySlipUrl: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    : []
  return {
    id: partial.id,
    date: partial.date,
    shift: partial.shift,
    supervisor: partial.supervisor ?? 'Alex',
    deposits: partial.deposits ?? '[]',
    depositBagNumbers: '[]',
    depositScanUrls: '[]',
    debitScanUrls: partial.debitScanUrls ?? '[]',
    securityScanUrls: '[]',
    systemDebit: partial.systemDebit ?? 0,
    otherCredit: partial.otherCredit ?? 0,
    depositRecords
  } as ShiftWithDepositRecords
}

describe('buildComparisonRowsFromShifts credit/debit', () => {
  it('emits one debit row per shift instead of a day total', () => {
    const rows = buildComparisonRowsFromShifts([
      shift({
        id: 's1',
        date: '2026-09-23',
        shift: '6-1',
        supervisor: 'Althea',
        systemDebit: 1001.28,
        otherCredit: 0,
        bankStatus: 'cleared'
      }),
      shift({
        id: 's2',
        date: '2026-09-23',
        shift: '1-9',
        supervisor: 'Marjorie',
        systemDebit: 0,
        otherCredit: 7027.71
      })
    ])
    const debits = rows.filter((r) => r.recordKind === 'debit')
    assert.equal(debits.length, 2)
    assert.deepEqual(
      debits.map((r) => r.shift).sort(),
      ['1-9', '6-1']
    )
    assert.equal(debits.every((r) => r.shift !== 'Day total'), true)
    const morning = debits.find((r) => r.shift === '6-1')!
    const evening = debits.find((r) => r.shift === '1-9')!
    assert.equal(morning.shiftId, 's1')
    assert.equal(morning.amount, 1001.28)
    assert.equal(morning.systemDebit, 1001.28)
    assert.equal(morning.otherCredit, 0)
    assert.equal(morning.bankStatus, 'cleared')
    assert.equal(morning.supervisor, 'Althea')
    assert.equal(evening.shiftId, 's2')
    assert.equal(evening.amount, 7027.71)
    assert.equal(evening.systemDebit, 0)
    assert.equal(evening.otherCredit, 7027.71)
    assert.equal(evening.bankStatus, 'pending')
  })

  it('does not invent a row for a shift with only inherited debit scans', () => {
    const rows = buildComparisonRowsFromShifts([
      shift({
        id: 's1',
        date: '2026-09-23',
        shift: '6-1',
        systemDebit: 50,
        debitScanUrls: '["https://example.com/slip.jpg"]'
      }),
      shift({
        id: 's2',
        date: '2026-09-23',
        shift: '1-9',
        debitScanUrls: '["https://example.com/slip.jpg"]'
      })
    ])
    const debits = rows.filter((r) => r.recordKind === 'debit')
    assert.equal(debits.length, 1)
    assert.equal(debits[0].shift, '6-1')
    assert.equal(debits[0].amount, 50)
  })
})
