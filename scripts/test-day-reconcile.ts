import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconcileDay, type CstoreSnapshot, type ReconcileShiftInput } from '../lib/day-reconcile'

// Real figures: Shift Close shifts and the Cstore daily report for 2026-11-03 and 2026-11-04.
// Collected is the shifts' System column against their Count column, added up for the day (like the
// End of Shift screen). Over/Short = Count - System. Cstore is the Sales section and a keying check.

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

const nov4Shifts: ReconcileShiftInput[] = [
  shift({
    shift: '6-1',
    supervisor: 'Jovita Henry',
    systemCash: 13690.39,
    systemChecks: 920.55,
    countCash: 10159,
    countChecks: 4304.56,
    systemCredit: 3555.29,
    countCredit: 3719.86,
    systemDebit: 626.14,
    otherCredit: 3093.72,
    systemInhouse: 1290.18,
    countInhouse: 1290.19,
    systemFleet: 2156.94,
    countFleet: 2156.94,
    totalDeposits: 14468.11,
    unleaded: 2991.743,
    diesel: 2390.062
  }),
  shift({
    shift: '1-9',
    supervisor: 'Althea Frank',
    systemCash: 16930.04,
    systemChecks: 990,
    countCash: 15873.6,
    countChecks: 2637.04,
    systemCredit: 5700.84,
    countCredit: 5689.24,
    systemDebit: 778.95,
    otherCredit: 5200.29,
    systemInhouse: 379,
    countInhouse: 379,
    systemFleet: 1190.94,
    countFleet: 1190.94,
    totalDeposits: 18529.26,
    unleaded: 4685.587,
    diesel: 1552.138
  })
]

const nov4Cstore: CstoreSnapshot = {
  date: '2026-11-04',
  grocery: 2766.23,
  salesTax: 221.6,
  regularAmt: 29097.02,
  dieselAmt: 14940.98,
  custAccountPayIn: 0,
  totalSales: 47025.83,
  depositsTyped: 32997.37,
  fleetBatch: 3347.88,
  creditDebitBatch: 9699.1,
  custAccountSales: 1669.19,
  totalCollections: 47713.54,
  shortOver: 687.71,
  regularLitres: 7677.3,
  dieselLitres: 3942.2,
  tank: { regular: { os: -5.7 }, diesel: { os: -16.8 } }
}

const nov3Shifts: ReconcileShiftInput[] = [
  shift({
    shift: '6-1',
    systemCash: 11348.49,
    systemChecks: 349.46,
    countCash: 11351.25,
    countChecks: 150,
    systemCredit: 4129.66,
    countCredit: 4137.25,
    systemDebit: 602.85,
    otherCredit: 3534.4,
    systemInhouse: 838.31,
    countInhouse: 838.31,
    systemFleet: 2491.24,
    countFleet: 2491.24,
    totalDeposits: 10013,
    unleaded: 3042,
    diesel: 1690
  }),
  shift({
    shift: '1-9',
    systemCash: 14189.63,
    systemChecks: 2133.91,
    countCash: 14880.5,
    countChecks: 117.65,
    systemCredit: 4507.13,
    countCredit: 4747.32,
    systemDebit: 790.38,
    otherCredit: 4056.94,
    systemInhouse: 669.63,
    countInhouse: 669.63,
    systemFleet: 730,
    countFleet: 730,
    totalDeposits: 15009,
    unleaded: 3524.72,
    diesel: 1947.05
  })
]

const nov3Cstore: CstoreSnapshot = {
  date: '2026-11-03',
  grocery: 2696.73,
  salesTax: 204.02,
  regularAmt: 24889.83,
  dieselAmt: 13787.4,
  custAccountPayIn: 975.19,
  totalSales: 42553.17,
  depositsTyped: 25022.5,
  fleetBatch: 3221.24,
  creditDebitBatch: 9004.97,
  custAccountSales: 1507.94,
  totalCollections: 38756.65,
  shortOver: -3796.52,
  regularLitres: 6567.3,
  dieselLitres: 3637.8,
  tank: { regular: { os: 12.3 }, diesel: { os: 24.8 } }
}

const row = (r: ReturnType<typeof reconcileDay>, key: string) => r.collected.lines.find((l) => l.key === key)!
const salesLine = (r: ReturnType<typeof reconcileDay>, key: string) => r.sales.lines.find((l) => l.key === key)!

describe('reconcileDay: Nov 3 (System vs Count from the shifts)', () => {
  const r = reconcileDay(nov3Shifts, nov3Cstore)

  it('Cash + Checks: system 28,021.49, count 26,499.40, short 1,522.09', () => {
    assert.equal(row(r, 'cashChecks').system, 28021.49)
    assert.equal(row(r, 'cashChecks').count, 26499.4)
    assert.equal(row(r, 'cashChecks').overShort, -1522.09)
    assert.equal(row(r, 'cashChecks').status, 'differs')
    assert.equal(r.overShort.key, 'cashChecks')
    assert.equal(r.overShort.overShort, -1522.09)
  })

  it('Credits count is 247.78 above the system; In-House and Fleets agree', () => {
    assert.equal(row(r, 'credits').system, 8636.79)
    assert.equal(row(r, 'credits').count, 8884.57)
    assert.equal(row(r, 'credits').overShort, 247.78)
    assert.equal(row(r, 'inhouse').status, 'match')
    assert.equal(row(r, 'fleets').status, 'match')
  })

  it('has no Massy Coupons row when neither side uses it, and no total row', () => {
    assert.deepEqual(
      r.collected.lines.map((l) => l.key),
      ['cashChecks', 'credits', 'inhouse', 'fleets']
    )
  })

  it('deposit line: 25,022.00 deposited is 1,477.40 less than the 26,499.40 counted', () => {
    assert.equal(r.collected.deposit.counted, 26499.4)
    assert.equal(r.collected.deposit.deposited, 25022)
    assert.equal(r.collected.deposit.diff, -1477.4)
    assert.equal(r.collected.deposit.status, 'differs')
  })

  it('does not compare fuel litres and counts three differences', () => {
    assert.equal(salesLine(r, 'regularLitres').status, 'none')
    assert.equal(salesLine(r, 'dieselLitres').status, 'none')
    assert.equal(r.differenceCount, 3)
    assert.equal(r.verdict, 'differs')
    assert.equal(r.verdictText, '3 differences')
    assert.ok(!r.notes.some((n) => /Fuel litres/.test(n)))
  })

  it('reads the short, the deposit gap and what was keyed differently in Cstore', () => {
    assert.ok(r.notes.some((n) => /^Cash \+ Checks short \$1,522\.09: \$26,499\.40 counted against \$28,021\.49 on the system\./.test(n)))
    assert.ok(r.notes.some((n) => /^Over\/short on: Credit\/Debit \+\$247\.78\./.test(n)))
    assert.ok(r.notes.some((n) => /^Deposited \$25,022\.00, \$1,477\.40 less than the \$26,499\.40 counted\./.test(n)))
    assert.ok(r.notes.some((n) => /Cstore was keyed differently from the shifts on: Credit\/Debit \+\$20\.40, Deposits \+\$0\.50\./.test(n)))
  })

  it('has no shift missing POS figures and includes the pay-in row', () => {
    assert.equal(r.shiftWarnings.length, 0)
    assert.ok(r.sales.lines.some((l) => l.key === 'payIn' && l.cstore === 975.19))
  })
})

describe('reconcileDay: Nov 4 (small gaps)', () => {
  const r = reconcileDay(nov4Shifts, nov4Cstore)

  it('Cash + Checks is over by 443.22 and Credits by 152.97', () => {
    assert.equal(row(r, 'cashChecks').system, 32530.98)
    assert.equal(row(r, 'cashChecks').count, 32974.2)
    assert.equal(row(r, 'cashChecks').overShort, 443.22)
    assert.equal(row(r, 'credits').overShort, 152.97)
  })

  it('In-House is a one-cent difference and Fleets agree', () => {
    assert.equal(row(r, 'inhouse').overShort, 0.01)
    assert.equal(row(r, 'inhouse').status, 'differs')
    assert.equal(row(r, 'fleets').status, 'match')
  })

  it('a deposit 23.17 above the count is within the 30 dollar band', () => {
    assert.equal(r.collected.deposit.diff, 23.17)
    assert.equal(r.collected.deposit.status, 'match')
  })

  it('Cstore was keyed one cent differently on Customer accounts', () => {
    assert.equal(r.differenceCount, 3)
    assert.ok(r.notes.some((n) => /keyed differently from the shifts on: Customer accounts \+\$0\.01\./.test(n)))
  })

  it('reads the over', () => {
    assert.ok(r.notes.some((n) => /^Cash \+ Checks over \$443\.22/.test(n)))
  })
})

describe('reconcileDay: nothing waits on what the manager types into Cstore', () => {
  it('works the same when Cstore has no deposits or card batch yet', () => {
    const untyped: CstoreSnapshot = {
      ...nov3Cstore,
      depositsTyped: 0,
      creditDebitBatch: 0,
      totalCollections: 4729.18,
      shortOver: -37823.99,
      pulledAt: '2026-11-08T11:00:00.000Z'
    }
    const r = reconcileDay(nov3Shifts, untyped)
    assert.equal(r.awaitingDeposits, true)
    assert.equal(row(r, 'cashChecks').overShort, -1522.09)
    assert.equal(row(r, 'credits').overShort, 247.78)
    assert.equal(r.differenceCount, 3)
    // Untyped lines are not compared, so there is no keying note and no Cstore-only notes.
    assert.ok(!r.notes.some((n) => /keyed differently/.test(n)))
    assert.ok(!r.notes.some((n) => /other collections/.test(n)))
    assert.ok(!r.notes.some((n) => /Tanks over\/short/.test(n)))
    assert.equal(r.pulledAt, untyped.pulledAt)
  })

  it('shows the full Collected table with no Cstore report at all', () => {
    const r = reconcileDay(nov4Shifts, null)
    assert.equal(r.hasCstore, false)
    assert.equal(r.sales.lines.length, 0)
    assert.equal(r.awaitingDeposits, false)
    assert.equal(row(r, 'cashChecks').overShort, 443.22)
    assert.equal(r.verdict, 'differs')
    assert.equal(r.verdictText, '3 differences')
  })

  it('says Waiting for Cstore when the shifts balance but no report is in', () => {
    const balanced = [
      shift({
        systemCash: 100,
        countCash: 100,
        systemCredit: 50,
        countCredit: 50,
        totalDeposits: 100
      })
    ]
    const r = reconcileDay(balanced, null)
    assert.equal(r.verdict, 'waiting')
    assert.equal(r.verdictText, 'Waiting for Cstore')
    assert.equal(r.differenceCount, 0)
  })
})

describe('reconcileDay: a shift with no POS figures', () => {
  it('still warns about it', () => {
    const r = reconcileDay(
      [shift({ shift: '1-9', supervisor: 'Althea Frank', totalDeposits: 18529.26 })],
      null
    )
    assert.equal(r.shifts[0].missingPos, true)
    assert.equal(r.shiftWarnings.length, 1)
    assert.match(r.shiftWarnings[0], /^1-9 shift \(Althea Frank\): no cash, checks, Fleet or In-house entered\./)
  })
})

describe('reconcileDay: Massy Coupons', () => {
  it('adds the row only when either side has coupons', () => {
    const r = reconcileDay([shift({ systemMassyCoupons: 20, countMassyCoupons: 15 })], null)
    assert.equal(row(r, 'massy').overShort, -5)
  })
})

describe('reconcileDay: everything agrees', () => {
  it('reports reconciled', () => {
    const shifts = [
      shift({
        shift: '6-1',
        systemCash: 100,
        countCash: 100,
        systemFleet: 10,
        countFleet: 10,
        systemInhouse: 5,
        countInhouse: 5,
        systemDebit: 20,
        otherCredit: 30,
        systemCredit: 50,
        countCredit: 50,
        totalDeposits: 100,
        unleaded: 50,
        diesel: 60
      })
    ]
    const cs: CstoreSnapshot = {
      date: '2026-01-01',
      grocery: 0,
      salesTax: 0,
      regularAmt: 0,
      dieselAmt: 0,
      custAccountPayIn: 0,
      totalSales: 165,
      depositsTyped: 100,
      fleetBatch: 10,
      creditDebitBatch: 50,
      custAccountSales: 5,
      totalCollections: 165,
      shortOver: 0,
      regularLitres: 50,
      dieselLitres: 60
    }
    const r = reconcileDay(shifts, cs)
    assert.equal(r.overShort.status, 'match')
    assert.equal(r.verdict, 'reconciled')
    assert.equal(r.verdictText, 'Reconciled')
    assert.deepEqual(r.notes, ['Shift Close agrees with Cstore on every line.'])
  })
})
