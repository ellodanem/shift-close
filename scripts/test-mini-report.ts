import test from 'node:test'
import assert from 'node:assert/strict'
import { pathnameAllowedForRole } from '../lib/access-control'
import { formatDmy, toMiniReport } from '../lib/mini-report'
import type { RangeReport } from '../lib/day-range-report'

test('stakeholder can open the mini report and nothing else of End of Day', () => {
  for (const path of ['/days/mini', '/api/days/mini']) {
    assert.equal(pathnameAllowedForRole(path, 'stakeholder'), true, path)
  }
  for (const path of ['/days', '/days/v1', '/days/v2', '/days/v2/report', '/api/days', '/api/days/v2', '/api/days/2026-11-09/upload']) {
    assert.equal(pathnameAllowedForRole(path, 'stakeholder'), false, path)
  }
})

test('other roles keep full End of Day', () => {
  for (const role of ['admin', 'manager', 'operations_manager']) {
    assert.equal(pathnameAllowedForRole('/days/v2', role), true, role)
    assert.equal(pathnameAllowedForRole('/days/mini', role), true, role)
  }
})

test('toMiniReport keeps only Collected and Deposit totals', () => {
  const full = {
    from: '2026-11-06',
    to: '2026-11-08',
    dayCount: 3,
    cstoreDayCount: 3,
    missingCstoreDates: [],
    sales: { lines: [{ key: 'grocery', label: 'Grocery', amount: 1 }], totalSales: 1 },
    fuel: [],
    collected: [
      { key: 'cashChecks', label: 'Cash + Checks', system: 90440.82, count: 86876.41, overShort: -3564.41, status: 'differs' as const }
    ],
    cashChecks: { key: 'cashChecks', label: 'Cash + Checks', system: 90440.82, count: 86876.41, overShort: -3564.41, status: 'differs' as const },
    deposit: { counted: 86876.41, deposited: 89118.13, diff: 2241.72, status: 'differs' as const },
    byDay: [],
    notes: ['secret note']
  } satisfies RangeReport
  const mini = toMiniReport(full)
  assert.deepEqual(mini, {
    from: '2026-11-06',
    to: '2026-11-08',
    dayCount: 3,
    collected: [{ key: 'cashChecks', label: 'Cash + Checks', system: 90440.82, count: 86876.41, status: 'differs' }],
    deposit: { counted: 86876.41, deposited: 89118.13, status: 'differs' }
  })
  const text = JSON.stringify(mini)
  assert.ok(!text.includes('overShort') && !text.includes('diff"') && !text.includes('secret'))
})

test('formatDmy writes DD-MM-YYYY', () => {
  assert.equal(formatDmy('2026-11-06'), '06-11-2026')
  assert.equal(formatDmy('nope'), 'nope')
})
