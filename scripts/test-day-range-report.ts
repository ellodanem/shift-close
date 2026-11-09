import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconcileDay, type CstoreSnapshot, type ReconcileShiftInput } from '../lib/day-reconcile'
import { buildRangeReport } from '../lib/day-range-report'

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

const cstore = (date: string, over: Partial<CstoreSnapshot> = {}): CstoreSnapshot => ({
  date,
  grocery: 1000,
  salesTax: 100,
  regularAmt: 5000,
  dieselAmt: 3000,
  custAccountPayIn: 0,
  totalSales: 9100,
  depositsTyped: 0,
  fleetBatch: 0,
  creditDebitBatch: 0,
  custAccountSales: 0,
  totalCollections: 0,
  shortOver: 0,
  regularLitres: 1200.34,
  dieselLitres: 800.06,
  ...over
})

// Day A: 100 short on Cash + Checks, deposit 40 over the count (beyond the 30 band). Cstore report present.
const dayA = {
  date: '2026-11-02',
  reconcile: reconcileDay(
    [
      shift({
        systemCash: 1000,
        systemChecks: 200,
        countCash: 1000,
        countChecks: 100,
        systemCredit: 500,
        countCredit: 505,
        totalDeposits: 1140
      })
    ],
    cstore('2026-11-02')
  )
}

// Day B: everything agrees, deposit 10 over the count (inside the band). Cstore report present with a pay-in.
const dayB = {
  date: '2026-11-01',
  reconcile: reconcileDay(
    [
      shift({
        systemCash: 800,
        systemChecks: 100,
        countCash: 800,
        countChecks: 100,
        systemMassyCoupons: 40,
        countMassyCoupons: 40,
        totalDeposits: 910
      })
    ],
    cstore('2026-11-01', { custAccountPayIn: 25, totalSales: 9125, regularLitres: 1000, dieselLitres: 500 })
  )
}

// Day C: no Cstore report yet. Cash + Checks 50 over.
const dayC = {
  date: '2026-11-03',
  reconcile: reconcileDay(
    [shift({ systemCash: 500, systemChecks: 0, countCash: 550, countChecks: 0, totalDeposits: 550 })],
    null
  )
}

describe('buildRangeReport', () => {
  const r = buildRangeReport([dayA, dayB, dayC])

  it('orders the days and reports the range', () => {
    assert.equal(r.from, '2026-11-01')
    assert.equal(r.to, '2026-11-03')
    assert.equal(r.dayCount, 3)
    assert.deepEqual(
      r.byDay.map((d) => d.date),
      ['2026-11-01', '2026-11-02', '2026-11-03']
    )
  })

  it('adds up Collected as System, Count and Over/Short (Count minus System)', () => {
    assert.equal(r.cashChecks.system, 1200 + 900 + 500)
    assert.equal(r.cashChecks.count, 1100 + 900 + 550)
    assert.equal(r.cashChecks.overShort, -50)
    assert.equal(r.cashChecks.status, 'differs')
    assert.deepEqual(
      r.collected.map((l) => l.key),
      ['cashChecks', 'credits', 'inhouse', 'fleets', 'massy']
    )
    assert.equal(r.collected.find((l) => l.key === 'credits')?.overShort, 5)
    assert.equal(r.collected.find((l) => l.key === 'massy')?.system, 40)
  })

  it('adds up the deposit table over the range', () => {
    assert.equal(r.deposit.counted, 1100 + 900 + 550)
    assert.equal(r.deposit.deposited, 1140 + 910 + 550)
    assert.equal(r.deposit.diff, 50)
    assert.equal(r.deposit.status, 'differs')
  })

  it('range figures equal the sum of the by-day figures', () => {
    const sum = (pick: (d: (typeof r.byDay)[number]) => number) =>
      Math.round(r.byDay.reduce((t, d) => t + pick(d), 0) * 100) / 100
    assert.equal(sum((d) => d.cashOverShort), r.cashChecks.overShort)
    assert.equal(sum((d) => d.depositDiff), r.deposit.diff)
  })

  it('sales and fuel only cover days with a Cstore report', () => {
    assert.equal(r.cstoreDayCount, 2)
    assert.deepEqual(r.missingCstoreDates, ['2026-11-03'])
    assert.equal(r.sales.totalSales, 9100 + 9125)
    assert.equal(r.sales.lines.find((l) => l.key === 'grocery')?.amount, 2000)
    assert.equal(r.sales.lines.find((l) => l.key === 'payIn')?.amount, 25)
    assert.equal(r.fuel.find((l) => l.key === 'regularLitres')?.litres, 2200.3)
    assert.equal(r.fuel.find((l) => l.key === 'dieselLitres')?.litres, 1300.1)
  })

  it("counts each day's differences from Collected and the deposit only", () => {
    const byDate = Object.fromEntries(r.byDay.map((d) => [d.date, d]))
    assert.equal(byDate['2026-11-01'].verdictText, 'All match')
    assert.equal(byDate['2026-11-02'].verdictText, '3 differences')
    assert.equal(byDate['2026-11-03'].verdictText, '1 difference')
  })

  it('writes plain notes', () => {
    assert.ok(r.notes.some((n) => /^Cash \+ Checks short \$50\.00 over 3 days \(1 day short, 1 over\)\. Largest shortage: Nov 2 -\$100\.00\./.test(n)))
    assert.ok(r.notes.some((n) => /^Deposit more than \$30\.00 away from the cash counted: Nov 2 \+\$40\.00/.test(n)))
    assert.ok(r.notes.some((n) => /No Cstore report for Nov 3/.test(n)))
  })

  it('handles an empty range', () => {
    const e = buildRangeReport([])
    assert.equal(e.dayCount, 0)
    assert.equal(e.byDay.length, 0)
    assert.equal(e.cashChecks.overShort, 0)
  })
})
