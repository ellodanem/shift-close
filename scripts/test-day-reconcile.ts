import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconcileDay, type CstoreSnapshot, type ReconcileShiftInput } from '../lib/day-reconcile'

// Real figures: Shift Close shifts and the Cstore daily report for 2026-11-04 and 2026-11-03.
// Collected is laid out like the End of Shift screen: System (Cstore) vs Count (Shift Close), Over/Short = Count - System.

const shift = (over: Partial<ReconcileShiftInput>): ReconcileShiftInput => ({
  shift: '6-1',
  supervisor: '',
  systemCash: 0,
  systemChecks: 0,
  systemDebit: 0,
  otherCredit: 0,
  systemInhouse: 0,
  systemFleet: 0,
  countCash: 0,
  countChecks: 0,
  countCredit: 0,
  countInhouse: 0,
  countFleet: 0,
  totalDeposits: 0,
  unleaded: 0,
  diesel: 0,
  ...over
})

// Nov 4 as first entered: the 1-9 shift had only debit/credit and deposits typed, no Fleet or In-house.
const nov4Shifts: ReconcileShiftInput[] = [
  shift({
    shift: '6-1',
    supervisor: 'Jovita Henry',
    systemCash: 13690.39,
    systemChecks: 920.55,
    systemDebit: 626.14,
    otherCredit: 3093.72,
    systemInhouse: 1290.18,
    systemFleet: 2156.94,
    countCash: 10159,
    countChecks: 4304.56,
    countCredit: 3719.86,
    countInhouse: 1290.19,
    countFleet: 2156.94,
    totalDeposits: 14468.11,
    unleaded: 2991.743,
    diesel: 2390.062
  }),
  shift({
    shift: '1-9',
    supervisor: 'Althea Frank',
    systemDebit: 778.95,
    otherCredit: 5200.29,
    countCredit: 5689.24,
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
    systemDebit: 602.85,
    otherCredit: 3534.4,
    systemInhouse: 838.31,
    systemFleet: 2491.24,
    countCredit: 4137.25,
    countInhouse: 838.31,
    countFleet: 2491.24,
    totalDeposits: 10013,
    unleaded: 3042,
    diesel: 1690
  }),
  shift({
    shift: '1-9',
    systemCash: 14189.63,
    systemChecks: 2133.91,
    systemDebit: 790.38,
    otherCredit: 4056.94,
    systemInhouse: 669.63,
    systemFleet: 730,
    countCredit: 4747.32,
    countInhouse: 669.63,
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

const line = (r: ReturnType<typeof reconcileDay>, key: string) =>
  [...r.sales.lines, ...r.collected.lines].find((l) => l.key === key)!

describe('reconcileDay: Nov 4 (1-9 shift has no Fleet or In-house)', () => {
  const r = reconcileDay(nov4Shifts, nov4Cstore)

  it('Cash + Checks: Cstore expects 32,309.66, deposited 32,997.37, over by 687.71', () => {
    assert.equal(line(r, 'cashChecks').cstore, 32309.66)
    assert.equal(line(r, 'cashChecks').shiftClose, 32997.37)
    assert.equal(line(r, 'cashChecks').diff, 687.71)
    assert.equal(line(r, 'cashChecks').status, 'differs')
    assert.equal(r.overShort.key, 'cashChecks')
    assert.equal(r.overShort.diff, 687.71)
  })

  it('compares the counted slips: Credit/Debit is 290.00 under the POS card total', () => {
    assert.equal(line(r, 'creditDebit').cstore, 9699.1)
    assert.equal(line(r, 'creditDebit').shiftClose, 9409.1)
    assert.equal(line(r, 'creditDebit').diff, -290)
  })

  it('shows Fleet and Customer accounts short by what the 1-9 shift is missing', () => {
    assert.equal(line(r, 'fleet').shiftClose, 2156.94)
    assert.equal(line(r, 'fleet').diff, -1190.94)
    assert.equal(line(r, 'accounts').shiftClose, 1290.19)
    assert.equal(line(r, 'accounts').diff, -379)
  })

  it('lists Cash + Checks first and has no total or Collected-minus-sales line', () => {
    assert.deepEqual(
      r.collected.lines.map((l) => l.key),
      ['cashChecks', 'creditDebit', 'fleet', 'accounts']
    )
    assert.equal('total' in r.collected, false)
  })

  it('flags the 1-9 shift and reports four differences', () => {
    assert.equal(line(r, 'regularLitres').status, 'match')
    assert.equal(line(r, 'dieselLitres').status, 'match')
    assert.equal(r.verdict, 'differs')
    assert.equal(r.differenceCount, 4)
    assert.equal(r.verdictText, '4 differences')
    assert.equal(r.shifts.find((s) => s.shift === '1-9')?.missingPos, true)
    assert.equal(r.shifts.find((s) => s.shift === '6-1')?.missingPos, false)
    assert.equal(r.shiftWarnings.length, 1)
    assert.match(r.shiftWarnings[0], /^1-9 shift \(Althea Frank\): no cash, checks, Fleet or In-house entered\./)
  })

  it('reads Cash + Checks as an over', () => {
    assert.ok(r.notes.some((n) => /^Cash \+ Checks over \$687\.71: \$32,997\.37 deposited against \$32,309\.66/.test(n)))
  })
})

describe('reconcileDay: Nov 3 (Fleet and accounts agree, cash and card short)', () => {
  const r = reconcileDay(nov3Shifts, nov3Cstore)

  it('Fleet and Customer accounts agree exactly', () => {
    assert.equal(line(r, 'fleet').status, 'match')
    assert.equal(line(r, 'accounts').status, 'match')
  })

  it('Cash + Checks: Cstore expects 28,819.02, deposited 25,022.00, short 3,797.02', () => {
    assert.equal(line(r, 'cashChecks').cstore, 28819.02)
    assert.equal(line(r, 'cashChecks').shiftClose, 25022)
    assert.equal(line(r, 'cashChecks').diff, -3797.02)
    assert.equal(r.overShort.diff, -3797.02)
  })

  it('Credit/Debit slips are 120.40 under the POS card total', () => {
    assert.equal(line(r, 'creditDebit').shiftClose, 8884.57)
    assert.equal(line(r, 'creditDebit').diff, -120.4)
  })

  it('flags both fuel litres lines (0.58 L and 0.75 L are over the 0.1 L tolerance)', () => {
    assert.equal(line(r, 'regularLitres').status, 'differs')
    assert.equal(line(r, 'dieselLitres').status, 'differs')
    assert.equal(r.differenceCount, 4)
  })

  it('reads Cash + Checks as a short and names the card gap', () => {
    assert.ok(r.notes.some((n) => /^Cash \+ Checks short \$3,797\.02/.test(n)))
    assert.ok(r.notes.some((n) => /Count differs from Cstore on: Credit\/Debit -\$120\.40/.test(n)))
    assert.ok(!r.notes.some((n) => /Both sides show/.test(n)))
  })

  it('has no shift missing POS figures and includes the pay-in row', () => {
    assert.equal(r.shiftWarnings.length, 0)
    assert.ok(r.sales.lines.some((l) => l.key === 'payIn' && l.cstore === 975.19))
  })
})

describe('reconcileDay: no Cstore report yet', () => {
  const r = reconcileDay(nov4Shifts, null)

  it('waits for Cstore, still warns about the empty shift, and shows the shift side only', () => {
    assert.equal(r.verdict, 'waiting')
    assert.equal(r.verdictText, 'Waiting for Cstore')
    assert.equal(r.hasCstore, false)
    assert.equal(r.shiftWarnings.length, 1)
    assert.equal(r.sales.lines.length, 0)
    const cash = r.collected.lines.find((l) => l.key === 'cashChecks')
    assert.equal(cash?.shiftClose, 32997.37)
    assert.equal(cash?.cstore, null)
    assert.equal(cash?.status, 'none')
  })
})

describe('reconcileDay: Cstore saved before Credit card 2 and deposits were typed', () => {
  const half: CstoreSnapshot = {
    ...nov4Cstore,
    depositsTyped: 0,
    creditDebitBatch: 0,
    totalCollections: 4577.08,
    shortOver: -52260.49,
    pulledAt: '2026-11-07T11:00:00.000Z'
  }
  const r = reconcileDay(nov4Shifts, half)

  it('still compares Fleet and Customer accounts and marks Cash + Checks and Credit/Debit pending', () => {
    assert.equal(r.awaitingDeposits, true)
    assert.equal(r.hasCstore, true)
    const status = (key: string) => r.collected.lines.find((l) => l.key === key)?.status
    assert.equal(status('cashChecks'), 'pending')
    assert.equal(status('creditDebit'), 'pending')
    assert.equal(status('fleet'), 'differs')
    assert.equal(status('accounts'), 'differs')
    assert.equal(r.differenceCount, 2)
    assert.equal(r.verdict, 'differs')
    assert.equal(r.verdictText, '2 differences')
  })

  it('shows the Shift Close count but no System figure and no false short', () => {
    assert.equal(r.overShort.status, 'pending')
    assert.equal(r.overShort.cstore, null)
    assert.equal(r.overShort.diff, null)
    assert.equal(r.overShort.shiftClose, 32997.37)
    assert.equal(r.sales.totalSales, nov4Cstore.totalSales)
    assert.equal(r.pulledAt, half.pulledAt)
  })

  it('explains what is waiting and skips the other-collections and tank notes', () => {
    assert.ok(r.notes.some((n) => /Credit\/Debit is not entered in Cstore yet\. Cash \+ Checks compares once it is/.test(n)))
    assert.ok(!r.notes.some((n) => /other collections/.test(n)))
    assert.ok(!r.notes.some((n) => /Tanks over\/short/.test(n)))
  })

  it('says Waiting for Cstore entries when everything that can be compared agrees', () => {
    const agreeing: CstoreSnapshot = {
      ...nov3Cstore,
      depositsTyped: 0,
      creditDebitBatch: 0,
      regularLitres: 6566.72,
      dieselLitres: 3637.05,
      pulledAt: '2026-11-08T11:00:00.000Z'
    }
    const ok = reconcileDay(nov3Shifts, agreeing)
    assert.equal(ok.differenceCount, 0)
    assert.equal(ok.verdict, 'waiting')
    assert.equal(ok.verdictText, 'Waiting for Cstore entries')
    assert.ok(ok.notes.some((n) => /entered in Cstore so far agrees/.test(n)))
  })

  it('is not flagged when Cstore is simply absent', () => {
    assert.equal(reconcileDay(nov4Shifts, null).awaitingDeposits, false)
  })

  it('still works out Cash + Checks when the card is typed but Cstore deposits are not', () => {
    const r2 = reconcileDay(nov3Shifts, { ...nov3Cstore, depositsTyped: 0 })
    assert.equal(r2.awaitingDeposits, true)
    assert.equal(r2.overShort.status, 'differs')
    assert.equal(r2.overShort.diff, -3797.02)
    assert.ok(!r2.notes.some((n) => /Tanks over\/short/.test(n)))
  })

  it('treats a zero Cstore card batch as not entered even when deposits are typed', () => {
    const typed = reconcileDay(nov3Shifts, { ...nov3Cstore, creditDebitBatch: 0 })
    assert.equal(typed.awaitingDeposits, false)
    assert.equal(typed.collected.lines.find((l) => l.key === 'creditDebit')?.status, 'pending')
    assert.equal(typed.overShort.status, 'pending')
  })
})

describe('reconcileDay: everything agrees', () => {
  it('reports reconciled', () => {
    const shifts = [
      shift({
        shift: '6-1',
        systemCash: 100,
        systemFleet: 10,
        systemInhouse: 5,
        systemDebit: 20,
        otherCredit: 30,
        countCredit: 50,
        countInhouse: 5,
        countFleet: 10,
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
    assert.equal(r.overShort.cstore, 100)
    assert.equal(r.overShort.status, 'match')
    assert.equal(r.verdict, 'reconciled')
    assert.equal(r.verdictText, 'Reconciled')
    assert.deepEqual(r.notes, ['Shift Close agrees with Cstore on every line.'])
  })
})
