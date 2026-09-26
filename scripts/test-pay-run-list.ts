import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activePayrollYear,
  filterPayRuns,
  payrollCycleOptions,
  payrollYears,
  type PayRunListItem
} from '../lib/pay-run-list'

function run(partial: Partial<PayRunListItem> & Pick<PayRunListItem, 'endDate'>): PayRunListItem {
  return {
    cycleNumber: 0,
    status: 'processed',
    startDate: partial.endDate,
    payDate: partial.endDate,
    ...partial
  }
}

const runs: PayRunListItem[] = [
  run({ endDate: '2026-09-13', payDate: '2026-09-15', cycleNumber: 17, status: 'draft' }),
  run({ endDate: '2026-08-12', payDate: '2026-08-15', cycleNumber: 15, status: 'processed' }),
  run({ endDate: '2026-01-15', payDate: '2026-01-15', cycleNumber: 1, status: 'processed' }),
  run({ endDate: '2025-12-31', payDate: '2025-12-31', cycleNumber: 24, status: 'processed' }),
  run({ endDate: '2026-09-30', payDate: '2026-09-30', cycleNumber: 18, status: 'void' })
]

describe('payroll run list', () => {
  it('defaults to the active year with the latest cycle first', () => {
    assert.equal(activePayrollYear(new Date(2026, 8, 26)), 2026)
    const visible = filterPayRuns(runs, {
      year: 2026,
      month: 'all',
      cycle: 'all',
      hideVoided: true,
      sort: 'latest'
    })
    assert.deepEqual(
      visible.map((item) => item.cycleNumber),
      [17, 15, 1]
    )
  })

  it('filters by month and cycle', () => {
    const september = filterPayRuns(runs, {
      year: 2026,
      month: 9,
      cycle: 'all',
      hideVoided: false,
      sort: 'latest'
    })
    assert.deepEqual(
      september.map((item) => item.cycleNumber),
      [18, 17]
    )

    const cycle15 = filterPayRuns(runs, {
      year: 2026,
      month: 'all',
      cycle: 15,
      hideVoided: true,
      sort: 'latest'
    })
    assert.deepEqual(
      cycle15.map((item) => item.endDate),
      ['2026-08-12']
    )
  })

  it('puts the newer year above an older year when every year is shown', () => {
    const visible = filterPayRuns(runs, {
      year: 'all',
      month: 'all',
      cycle: 'all',
      hideVoided: true,
      sort: 'latest'
    })
    assert.equal(visible[0]?.endDate, '2026-09-13')
    assert.equal(visible.at(-1)?.endDate, '2025-12-31')
  })

  it('can sort earliest cycle first', () => {
    const visible = filterPayRuns(runs, {
      year: 2026,
      month: 'all',
      cycle: 'all',
      hideVoided: true,
      sort: 'earliest'
    })
    assert.deepEqual(
      visible.map((item) => item.cycleNumber),
      [1, 15, 17]
    )
  })

  it('offers the active year plus years that already have runs', () => {
    assert.deepEqual(payrollYears(runs, new Date(2026, 8, 26)), [2026, 2025])
    assert.deepEqual(payrollYears([], new Date(2026, 8, 26)), [2026])
    assert.deepEqual(payrollCycleOptions(runs, 2026, 9), [17, 18])
  })

  it('derives a missing cycle number from the period end', () => {
    const visible = filterPayRuns([run({ endDate: '2026-09-15', cycleNumber: 0 })], {
      year: 2026,
      month: 'all',
      cycle: 17,
      hideVoided: true,
      sort: 'latest'
    })
    assert.equal(visible.length, 1)
  })
})
