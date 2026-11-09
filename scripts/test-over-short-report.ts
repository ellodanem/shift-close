import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconcileDay, type ReconcileShiftInput } from '../lib/day-reconcile'
import {
  buildOverShortEmail,
  buildOverShortReport,
  rangeLabel,
  signedMoney,
  type OverShortDayInput
} from '../lib/over-short-report'

function shift(partial: Partial<ReconcileShiftInput>): ReconcileShiftInput {
  return {
    shift: '6-1',
    supervisor: 'A',
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
    ...partial
  }
}

function day(date: string, shifts: ReconcileShiftInput[]): OverShortDayInput {
  return { date, shifts, reconcile: reconcileDay(shifts, null) }
}

const days: OverShortDayInput[] = [
  // Cash + Checks -27.92, Credit/Debit -287.77, deposited 4.62 more than counted
  day('2026-11-01', [
    shift({ shift: '7:30 - 2', systemCash: 1000, countCash: 972.08, systemCredit: 500, countCredit: 212.23, totalDeposits: 976.7 })
  ]),
  // Cash + Checks -1522.09, Credit/Debit +247.78, deposited 1477.40 less than counted
  day('2026-11-03', [
    shift({ shift: '1-9', systemCash: 3000, countCash: 1477.91, systemCredit: 0, countCredit: 247.78, totalDeposits: 0.51 }),
    shift({ shift: '6-1' })
  ]),
  // Cash + Checks +443.22
  day('2026-11-04', [shift({ shift: '6-1', systemCash: 1000, countCash: 1443.22, totalDeposits: 1443.22 })]),
  // Balanced
  day('2026-11-05', [shift({ shift: '6-1', systemCash: 500, countCash: 500, totalDeposits: 500 })])
]

describe('buildOverShortReport', () => {
  const report = buildOverShortReport(days, '2026-11-01', '2026-11-07')

  it('lists a row per day with Count minus System for Cash + Checks and Credit/Debit', () => {
    assert.equal(report.rows.length, 4)
    const nov1 = report.rows[0]
    assert.equal(nov1.dayLabel, 'Nov 1')
    assert.equal(nov1.weekday, 'Sun')
    assert.equal(nov1.shifts, '7:30 - 2')
    assert.equal(nov1.cashChecks, -27.92)
    assert.equal(nov1.creditDebit, -287.77)
    assert.equal(nov1.depositDiff, 4.62)
    assert.equal(report.rows[1].shifts, '1-9 + 6-1')
    assert.equal(report.rows[1].cashChecks, -1522.09)
    assert.equal(report.rows[1].creditDebit, 247.78)
    assert.equal(report.rows[1].depositDiff, -1477.4)
  })

  it('adds up the range totals', () => {
    assert.equal(report.totals.cashChecks, -1106.79)
    assert.equal(report.totals.cashSystem, 5500)
    assert.equal(report.totals.cashCount, 4393.21)
  })

  it('flags days that need a look and not balanced days', () => {
    assert.deepEqual(
      report.rows.map((r) => r.flagged),
      [true, true, true, false]
    )
  })

  it('writes the short note and the largest shortage', () => {
    assert.equal(
      report.notes[0],
      'Cash + Checks short $1,106.79 over 4 days: $4,393.21 counted against $5,500.00 on the system.'
    )
    assert.equal(report.notes[1], 'Largest daily shortage: Nov 3 -$1,522.09.')
  })

  it('leaves out days outside the range and days with no shifts', () => {
    const r = buildOverShortReport([...days, day('2026-11-02', []), day('2026-10-31', [shift({ countCash: 5 })])], '2026-11-01', '2026-11-07')
    assert.equal(r.rows.length, 4)
  })

  it('says so when there are no closed shifts', () => {
    const r = buildOverShortReport([], '2026-11-01', '2026-11-07')
    assert.deepEqual(r.notes, ['No closed shifts in this range.'])
    assert.equal(r.rows.length, 0)
  })

  it('reports an overage as over, with no shortage line', () => {
    const r = buildOverShortReport([days[2]], '2026-11-04', '2026-11-04')
    assert.match(r.notes[0], /^Cash \+ Checks over \$443\.22 over 1 day:/)
    assert.equal(r.notes.some((n) => n.startsWith('Largest daily shortage')), false)
  })

  it('says balanced when the week nets to zero', () => {
    const r = buildOverShortReport([days[3]], '2026-11-05', '2026-11-05')
    assert.equal(r.notes[0], 'Cash + Checks balanced over 1 day.')
  })
})

describe('formatting', () => {
  it('shows signed dollars and a dash for zero', () => {
    assert.equal(signedMoney(-27.92), '-$27.92')
    assert.equal(signedMoney(4.62), '+$4.62')
    assert.equal(signedMoney(0), '-')
    assert.equal(signedMoney(0.001), '-')
  })

  it('labels a range', () => {
    assert.equal(rangeLabel('2026-11-01', '2026-11-07'), 'Nov 1 to Nov 7, 2026')
    assert.equal(rangeLabel('2026-11-07', '2026-11-07'), 'Nov 7, 2026')
  })
})

describe('buildOverShortEmail', () => {
  const report = buildOverShortReport(days, '2026-11-01', '2026-11-07')

  it('has a subject with the range and the figures in the body', () => {
    const email = buildOverShortEmail(report, 'https://example.test/')
    assert.equal(email.subject, 'Over/short report: Nov 1 to Nov 7, 2026')
    assert.match(email.html, /Range total/)
    assert.match(email.html, /-\$1,106\.79/)
    assert.match(email.html, /Largest daily shortage: Nov 3 -\$1,522\.09\./)
    assert.match(email.html, /https:\/\/example\.test\/reports\/over-short\?from=2026-11-01&amp;to=2026-11-07/)
    assert.match(email.text, /Range total/)
    assert.match(email.text, /Nov 3 Tue/)
  })

  it('leaves the link out when there is no app URL', () => {
    assert.equal(buildOverShortEmail(report, '').html.includes('Open this report'), false)
  })
})
