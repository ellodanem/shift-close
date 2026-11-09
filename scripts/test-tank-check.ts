import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CstoreSnapshot } from '../lib/day-reconcile'
import {
  buildDayTankCheck,
  compareTank,
  endOfDayReadingFor,
  stickEntered,
  suggestOpeningFromCstore,
  type OpeningReadingInput
} from '../lib/tank-check'

function snapshot(date: string, tank: CstoreSnapshot['tank']): CstoreSnapshot {
  return {
    date,
    grocery: 0,
    salesTax: 0,
    regularAmt: 0,
    dieselAmt: 0,
    custAccountPayIn: 0,
    totalSales: 1000,
    depositsTyped: 1000,
    fleetBatch: 0,
    creditDebitBatch: 0,
    custAccountSales: 0,
    totalCollections: 1000,
    shortOver: 0,
    regularLitres: 7677.3,
    dieselLitres: 3942.2,
    tank
  }
}

function opening(date: string, unleadedLitres: number, dieselLitres: number, createdAt = `${date}T12:00:00.000Z`): OpeningReadingInput {
  return { date, createdAt, unleadedLitres, dieselLitres }
}

describe('compareTank', () => {
  it('treats a 1 L gap as rounding and matches', () => {
    const r = compareTank(11501, 11502)
    assert.deepEqual(r, { diff: 1, status: 'match', rounding: true })
  })

  it('matches exactly with no rounding flag', () => {
    assert.deepEqual(compareTank(6008, 6008), { diff: 0, status: 'match', rounding: false })
  })

  it('flags a gap bigger than rounding', () => {
    const r = compareTank(11501, 11504)
    assert.equal(r.status, 'differs')
    assert.equal(r.diff, 3)
    assert.equal(r.rounding, false)
  })

  it('has no verdict when a side is missing', () => {
    assert.equal(compareTank(null, 6008).status, 'none')
    assert.equal(compareTank(6008, null).status, 'none')
  })
})

describe('stickEntered', () => {
  it('reads 0 or missing as not entered', () => {
    assert.equal(stickEntered(0), false)
    assert.equal(stickEntered(null), false)
    assert.equal(stickEntered(undefined), false)
    assert.equal(stickEntered(6008), true)
  })
})

describe('buildDayTankCheck', () => {
  const nov8 = snapshot('2026-11-08', {
    regular: { opening: 14000, purchase: 0, closing: 11501, stick: 11501, os: 0 },
    diesel: { opening: 8000, purchase: 0, closing: 6008, stick: 6008, os: 0 }
  })

  it('compares the end-of-day reading with the Cstore stick (Nov 8: 11502 and 6008 against 11501 and 6008)', () => {
    const check = buildDayTankCheck('2026-11-08', nov8, { unleaded: 11502, diesel: 6008 })
    assert.equal(check.readingDate, '2026-11-09')
    const [u, d] = check.grades
    assert.equal(u.status, 'match')
    assert.equal(u.diff, 1)
    assert.equal(u.rounding, true)
    assert.equal(d.status, 'match')
    assert.equal(d.diff, 0)
    assert.equal(d.rounding, false)
    assert.equal(check.notes.length, 1)
    assert.match(check.notes[0], /agree with Cstore/)
    assert.match(check.notes[0], /rounding/)
  })

  it('says so when a reading is far from the stick', () => {
    const check = buildDayTankCheck('2026-11-08', nov8, { unleaded: 11600, diesel: 6008 })
    assert.equal(check.grades[0].status, 'differs')
    assert.match(check.notes.join(' '), /Unleaded reading 11,600 L differs from the Cstore stick 11,501 L/)
  })

  it('waits for the stick when Cstore saved a report with the stick at 0', () => {
    const waiting = snapshot('2026-11-06', {
      regular: { opening: 12500, purchase: 0, closing: 3321.1, stick: 0, os: -3321.1 },
      diesel: { opening: 7155, purchase: 0, closing: 2177.3, stick: 0, os: -2177.3 }
    })
    const check = buildDayTankCheck('2026-11-06', waiting, { unleaded: 3300, diesel: 2170 })
    assert.equal(check.grades[0].status, 'pending')
    assert.equal(check.grades[0].cstoreStick, null)
    assert.equal(check.grades[0].cstoreClosing, null)
    assert.equal(check.grades[0].cstoreOs, null)
    assert.equal(check.grades[0].bookOff, false)
    assert.match(check.notes[0], /not entered yet for unleaded and diesel/)
  })

  it('shows the reading alone when Cstore has no report', () => {
    const check = buildDayTankCheck('2026-11-08', null, { unleaded: 11502, diesel: 6008 })
    assert.equal(check.hasCstore, false)
    assert.equal(check.hasReading, true)
    assert.equal(check.grades[0].status, 'none')
    assert.equal(check.grades[0].reading, 11502)
    assert.deepEqual(check.notes, [])
  })

  it('warns when Cstore book is far from its own stick (a delivery not entered there)', () => {
    const off = snapshot('2026-11-05', {
      regular: { opening: 4663, purchase: 1877, closing: -657.8, stick: 12580, os: 13237.8 },
      diesel: { opening: 3947, purchase: 3805, closing: 3352.1, stick: 7155, os: 3802.9 }
    })
    const check = buildDayTankCheck('2026-11-05', off, null)
    assert.equal(check.grades[0].bookOff, true)
    assert.equal(check.grades[1].bookOff, true)
    assert.match(check.notes.join(' '), /delivery may not be entered there/)
  })

  it('does not call a small Cstore over/short a problem', () => {
    const fine = snapshot('2026-11-04', {
      regular: { opening: 12346, purchase: 0, closing: 4668.7, stick: 4663, os: -5.7 },
      diesel: { opening: 7906, purchase: 0, closing: 3963.8, stick: 3947, os: -16.8 }
    })
    const check = buildDayTankCheck('2026-11-04', fine, null)
    assert.equal(check.grades[0].bookOff, false)
    assert.equal(check.grades[1].bookOff, false)
  })
})

describe('endOfDayReadingFor', () => {
  it('is the opening saved for the next morning', () => {
    const openings = [opening('2026-11-09', 11502, 6008), opening('2026-10-26', 11360, 9275)]
    assert.deepEqual(endOfDayReadingFor('2026-11-08', openings), { unleaded: 11502, diesel: 6008 })
    assert.equal(endOfDayReadingFor('2026-11-07', openings), null)
  })

  it('uses the newest save when the morning has two', () => {
    const openings = [
      opening('2026-11-09', 11000, 6000, '2026-11-09T08:00:00.000Z'),
      opening('2026-11-09', 11502, 6008, '2026-11-09T09:00:00.000Z')
    ]
    assert.deepEqual(endOfDayReadingFor('2026-11-08', openings), { unleaded: 11502, diesel: 6008 })
  })

  it('rolls over a month end', () => {
    assert.deepEqual(endOfDayReadingFor('2026-10-31', [opening('2026-11-01', 5000, 4000)]), {
      unleaded: 5000,
      diesel: 4000
    })
  })
})

describe('suggestOpeningFromCstore', () => {
  const nov8 = snapshot('2026-11-08', {
    regular: { opening: 14000, purchase: 0, closing: 11501, stick: 11501, os: 0 },
    diesel: { opening: 8000, purchase: 0, closing: 6008, stick: 6008, os: 0 }
  })
  const snapshots = new Map([['2026-11-08', nov8]])

  function checksFor(openings: OpeningReadingInput[]) {
    const reading = endOfDayReadingFor('2026-11-08', openings)
    return [buildDayTankCheck('2026-11-08', nov8, reading)]
  }

  it('suggests the Cstore stick as the next morning opening', () => {
    const openings = [opening('2026-10-26', 11360, 9275)]
    const s = suggestOpeningFromCstore(checksFor(openings), snapshots, openings, '2026-11-09')
    assert.deepEqual(s, { fromDate: '2026-11-08', date: '2026-11-09', unleaded: 11501, diesel: 6008 })
  })

  it('does not suggest once the reading is saved', () => {
    const openings = [opening('2026-10-26', 11360, 9275), opening('2026-11-09', 11502, 6008)]
    assert.equal(suggestOpeningFromCstore(checksFor(openings), snapshots, openings, '2026-11-09'), null)
  })

  it('does not suggest an opening dated in the future', () => {
    const openings = [opening('2026-10-26', 11360, 9275)]
    assert.equal(suggestOpeningFromCstore(checksFor(openings), snapshots, openings, '2026-11-08'), null)
  })

  it('does not go back past a newer saved opening', () => {
    const openings = [opening('2026-11-09', 11502, 6008)]
    const older = snapshot('2026-11-07', {
      regular: { opening: 1, purchase: 0, closing: 2, stick: 15000, os: 0 },
      diesel: { opening: 1, purchase: 0, closing: 2, stick: 8000, os: 0 }
    })
    const map = new Map([['2026-11-07', older]])
    const checks = [buildDayTankCheck('2026-11-07', older, null)]
    assert.equal(suggestOpeningFromCstore(checks, map, openings, '2026-11-10'), null)
  })

  it('skips a day whose stick is not entered', () => {
    const waiting = snapshot('2026-11-08', {
      regular: { opening: 14000, purchase: 0, closing: 11501, stick: 0, os: 0 },
      diesel: { opening: 8000, purchase: 0, closing: 6008, stick: 6008, os: 0 }
    })
    const openings = [opening('2026-10-26', 11360, 9275)]
    const checks = [buildDayTankCheck('2026-11-08', waiting, null)]
    assert.equal(
      suggestOpeningFromCstore(checks, new Map([['2026-11-08', waiting]]), openings, '2026-11-09'),
      null
    )
  })
})
