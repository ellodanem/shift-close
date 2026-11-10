import test from 'node:test'
import assert from 'node:assert/strict'
import { pathnameAllowedForRole } from '../lib/access-control'
import { buildMiniReport, formatDmy } from '../lib/mini-report'
import { reconcileDay, type ReconcileShiftInput } from '../lib/day-reconcile'
import type { DayReportV2 } from '../lib/day-reports-v2'

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

test('formatDmy writes DD-MM-YYYY', () => {
  assert.equal(formatDmy('2026-11-06'), '06-11-2026')
  assert.equal(formatDmy('nope'), 'nope')
})

const shift = (over: Partial<ReconcileShiftInput>): ReconcileShiftInput => ({
  shift: '6-1',
  supervisor: '',
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
  totalDeposits: 0,
  unleaded: 0,
  diesel: 0,
  ...over
})

const day = (date: string, shifts: ReconcileShiftInput[]): DayReportV2 =>
  ({ date, shifts, reconcile: reconcileDay(shifts, null) }) as unknown as DayReportV2

test('buildMiniReport: card / electronic, fleet, vouchers and the deposit, nothing else', () => {
  const d1 = day('2026-11-06', [
    shift({ systemDebit: 488.25, otherCredit: 2999.41, systemFleet: 100, systemInhouse: 25, systemMassyCoupons: 10, countCash: 500, totalDeposits: 520 }),
    shift({ shift: '1-9', systemDebit: 681.29, otherCredit: 4453.47, systemFleet: 50.5, systemInhouse: 50.25, countCash: 300, totalDeposits: 290 })
  ])
  const d2 = day('2026-11-07', [shift({ systemDebit: 151, otherCredit: 2557.91, systemMassyCoupons: 30 })])
  const mini = buildMiniReport([d1, d2])
  assert.equal(mini.from, '2026-11-06')
  assert.equal(mini.to, '2026-11-07')
  assert.equal(mini.dayCount, 2)
  assert.equal(mini.card.debit, 1320.54)
  assert.equal(mini.card.credit, 10010.79)
  assert.equal(mini.card.total, 11331.33)
  assert.equal(mini.inhouse, 75.25)
  assert.equal(mini.fleet, 150.5)
  assert.equal(mini.vouchers, 40)
  assert.deepEqual(mini.deposit, { deposited: 810, status: 'match' })
  assert.deepEqual(Object.keys(mini).sort(), ['card', 'dayCount', 'deposit', 'fleet', 'from', 'inhouse', 'to', 'vouchers'])
})
