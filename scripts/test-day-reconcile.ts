import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconcileDay, type CstoreSnapshot, type ReconcileShiftInput } from '../lib/day-reconcile'

// Real figures: Shift Close shifts and the Cstore daily report for 2026-11-04 and 2026-11-03.

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
    systemDebit: 626.14,
    otherCredit: 3093.72,
    systemInhouse: 1290.18,
    systemFleet: 2156.94,
    countCash: 10159,
    countChecks: 4304.56,
    totalDeposits: 14468.11,
    unleaded: 2991.743,
    diesel: 2390.062
  }),
  shift({
    shift: '1-9',
    supervisor: 'Althea Frank',
    systemDebit: 778.95,
    otherCredit: 5200.29,
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

describe('reconcileDay: Nov 4 (1-9 shift has no POS figures)', () => {
  const r = reconcileDay(nov4Shifts, nov4Cstore)

  it('matches deposits, Credit/Debit and fuel litres', () => {
    assert.equal(line(r, 'deposits').status, 'match')
    assert.equal(line(r, 'creditDebit').status, 'match')
    assert.equal(line(r, 'regularLitres').status, 'match')
    assert.equal(line(r, 'dieselLitres').status, 'match')
  })

  it('shows Fleet and Customer accounts short by what the 1-9 shift is missing', () => {
    assert.equal(line(r, 'fleet').shiftClose, 2156.94)
    assert.equal(line(r, 'fleet').diff, -1190.94)
    assert.equal(line(r, 'accounts').shiftClose, 1290.18)
    assert.equal(line(r, 'accounts').diff, -379.01)
  })

  it('totals collected 46,143.59 and over/short -882.24 against Cstore +687.71', () => {
    assert.equal(r.collected.total.shiftClose, 46143.59)
    assert.equal(r.collected.total.diff, -1569.95)
    assert.equal(r.overShort.shiftClose, -882.24)
    assert.equal(r.overShort.cstore, 687.71)
    assert.equal(r.overShort.diff, -1569.95)
  })

  it('flags the 1-9 shift and reports two differences', () => {
    assert.equal(r.verdict, 'differs')
    assert.equal(r.differenceCount, 2)
    assert.equal(r.verdictText, '2 differences')
    assert.equal(r.shifts.find((s) => s.shift === '1-9')?.missingPos, true)
    assert.equal(r.shifts.find((s) => s.shift === '6-1')?.missingPos, false)
    assert.equal(r.shiftWarnings.length, 1)
    assert.match(r.shiftWarnings[0], /^1-9 shift \(Althea Frank\): no cash, checks, Fleet or In-house entered\./)
  })

  it('does not call it a real short when the gap is large', () => {
    assert.ok(!r.notes.some((n) => n.includes('real')))
  })
})

describe('reconcileDay: Nov 3 (Fleet and accounts agree, small gaps, real short)', () => {
  const r = reconcileDay(nov3Shifts, nov3Cstore)

  it('Fleet and Customer accounts agree exactly', () => {
    assert.equal(line(r, 'fleet').status, 'match')
    assert.equal(line(r, 'accounts').status, 'match')
  })

  it('shows Credit/Debit $20.40 and Deposits $0.50 under Cstore', () => {
    assert.equal(line(r, 'creditDebit').diff, -20.4)
    assert.equal(line(r, 'deposits').diff, -0.5)
  })

  it('flags both fuel litres lines (0.58 L and 0.75 L are over the 0.1 L tolerance)', () => {
    assert.equal(line(r, 'regularLitres').status, 'differs')
    assert.equal(line(r, 'dieselLitres').status, 'differs')
    assert.equal(r.differenceCount, 4)
  })

  it('over/short is -3,817.42 against Cstore -3,796.52 and reads as a real short', () => {
    assert.equal(r.overShort.shiftClose, -3817.42)
    assert.equal(r.overShort.diff, -20.9)
    assert.ok(r.notes.some((n) => n.includes('real short')))
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
    assert.equal(r.collected.lines.find((l) => l.key === 'deposits')?.shiftClose, 32997.37)
    assert.equal(r.collected.lines.find((l) => l.key === 'deposits')?.cstore, null)
  })
})

describe('reconcileDay: Cstore saved before deposits were typed', () => {
  const half: CstoreSnapshot = {
    ...nov4Cstore,
    depositsTyped: 0,
    totalCollections: 4577.08,
    shortOver: -52260.49,
    pulledAt: '2026-11-07T11:00:00.000Z'
  }
  // Credit card 2 is typed by the manager too, so it is also not in yet.
  const halfSnapshot: CstoreSnapshot = { ...half, creditDebitBatch: 0 }
  const r = reconcileDay(nov4Shifts, halfSnapshot)

  it('still compares the POS lines and marks the typed lines as not entered', () => {
    assert.equal(r.awaitingDeposits, true)
    assert.equal(r.hasCstore, true)
    const status = (key: string) => r.collected.lines.find((l) => l.key === key)?.status
    assert.equal(status('deposits'), 'pending')
    assert.equal(status('creditDebit'), 'pending')
    assert.equal(status('fleet'), 'differs')
    assert.equal(status('accounts'), 'differs')
    assert.equal(r.differenceCount, 2)
    assert.equal(r.verdict, 'differs')
    assert.equal(r.verdictText, '2 differences')
  })

  it('shows the Shift Close totals but no false Cstore short', () => {
    assert.equal(r.collected.total.status, 'pending')
    assert.equal(r.collected.total.cstore, null)
    assert.equal(r.collected.total.shiftClose, 46143.59)
    assert.equal(r.overShort.status, 'pending')
    assert.equal(r.overShort.cstore, null)
    assert.equal(r.overShort.shiftClose, -882.24)
    assert.equal(r.sales.totalSales, nov4Cstore.totalSales)
    assert.equal(r.pulledAt, half.pulledAt)
  })

  it('explains what is waiting and skips the other-collections note', () => {
    assert.ok(r.notes.some((n) => /Deposits and Credit\/Debit not entered in Cstore yet/.test(n)))
    assert.ok(!r.notes.some((n) => /other collections/.test(n)))
    assert.ok(!r.notes.some((n) => /real short/.test(n)))
    assert.ok(!r.notes.some((n) => /Tanks over\/short/.test(n)))
  })

  it('says Waiting for deposits when everything that can be compared agrees', () => {
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
    assert.equal(ok.verdictText, 'Waiting for deposits')
    assert.ok(ok.notes.some((n) => /entered in Cstore so far agrees/.test(n)))
  })

  it('is not flagged when Cstore is simply absent', () => {
    assert.equal(reconcileDay(nov4Shifts, null).awaitingDeposits, false)
  })

  it('compares Credit/Debit normally once deposits are typed', () => {
    const typed = reconcileDay(nov3Shifts, { ...nov3Cstore, creditDebitBatch: 0 })
    assert.equal(typed.awaitingDeposits, false)
    assert.equal(typed.collected.lines.find((l) => l.key === 'creditDebit')?.status, 'differs')
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
    assert.equal(r.verdict, 'reconciled')
    assert.equal(r.verdictText, 'Reconciled')
    assert.deepEqual(r.notes, ['Shift Close agrees with Cstore on every line.'])
  })
})
