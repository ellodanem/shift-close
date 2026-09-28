import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { litresToGallons } from '../lib/fuel-constants'
import {
  buildDaysForMonth,
  buildFuelVolumeMaps,
  buildMonthsForYear,
  fuelComparisonThroughDate,
  fuelComparisonWidgetDay,
  lastRecordedFuelDay,
  totalsFromRows
} from '../lib/fuel-comparison'

describe('fuel comparison monthly view', () => {
  it('monthly gallons equal the sum of daily rounded gallons', () => {
    const maps = buildFuelVolumeMaps(
      [{ date: '2026-01-01', unleadedLitres: 1000, dieselLitres: 500 }],
      [{ date: '2025-01-01', unleadedLitres: 800, dieselLitres: 400 }],
      [],
      []
    )
    const days = buildDaysForMonth(2026, 1, maps)
    const monthTotals = totalsFromRows(days)
    assert.equal(monthTotals.gasGallonsCur, days.reduce((a, d) => a + d.gasGallonsCur, 0))
    assert.equal(monthTotals.gasGallonsCur, litresToGallons(1000))
    assert.equal(monthTotals.dieselGallonsPrev, litresToGallons(400))
    assert.equal(monthTotals.variance, monthTotals.totalGallonsCur - monthTotals.totalGallonsPrev)
  })

  it('year totals skip future months so current year is not compared to a full prior year', () => {
    const maps = buildFuelVolumeMaps(
      [
        { date: '2026-01-01', unleadedLitres: 1000, dieselLitres: 0 },
        { date: '2026-09-01', unleadedLitres: 2000, dieselLitres: 0 },
        { date: '2026-10-01', unleadedLitres: 9000, dieselLitres: 0 }
      ],
      [
        { date: '2025-01-01', unleadedLitres: 500, dieselLitres: 0 },
        { date: '2025-09-01', unleadedLitres: 700, dieselLitres: 0 },
        { date: '2025-10-01', unleadedLitres: 800, dieselLitres: 0 }
      ],
      [],
      []
    )
    const { months, totals } = buildMonthsForYear(2026, maps, { year: 2026, month: 9 })

    assert.equal(months[8].isIncomplete, true)
    assert.equal(months[8].isFuture, false)
    assert.equal(months[9].isFuture, true)
    assert.equal(months[9].gasLitresCur, 9000)

    assert.equal(totals.gasLitresCur, 3000)
    assert.equal(totals.gasLitresPrev, 1200)
    assert.equal(totals.gasLitresCur, months[0].gasLitresCur + months[8].gasLitresCur)
  })

  it('flags a month when any day is missing a required shift', () => {
    const maps = buildFuelVolumeMaps(
      [],
      [],
      [{ date: '2026-03-02', shift: '6-1', unleaded: 100, diesel: 50 }],
      []
    )
    const { months } = buildMonthsForYear(2026, maps, { year: 2026, month: 3 })
    assert.equal(months[2].hasMissingShiftData, true)
    assert.match(months[2].missingShiftInfo ?? '', /1 day/)
  })

  it('accumulated gallons stop on the closed day and leave later prior-year volume out', () => {
    const maps = buildFuelVolumeMaps(
      [
        { date: '2026-09-01', unleadedLitres: 1000, dieselLitres: 0 },
        { date: '2026-09-02', unleadedLitres: 500, dieselLitres: 200 }
      ],
      [
        { date: '2025-09-01', unleadedLitres: 800, dieselLitres: 0 },
        { date: '2025-09-02', unleadedLitres: 400, dieselLitres: 100 },
        { date: '2025-09-03', unleadedLitres: 9000, dieselLitres: 0 }
      ],
      [],
      []
    )
    const days = buildDaysForMonth(2026, 9, maps)
    const through = fuelComparisonThroughDate(days, '2026-09-02')
    assert.equal(through.day?.date, '2026-09-02')
    assert.equal(through.accumulated.gasLitresCur, 1500)
    assert.equal(through.accumulated.gasLitresPrev, 1200)
    assert.equal(through.accumulated.dieselLitresCur, 200)
    const fullMonth = totalsFromRows(days)
    assert.ok(fullMonth.gasLitresPrev > through.accumulated.gasLitresPrev)
  })

  it('picks the latest day with this year volume and skips later prior-year-only rows', () => {
    const maps = buildFuelVolumeMaps(
      [
        { date: '2026-09-25', unleadedLitres: 3262, dieselLitres: 1154 },
        { date: '2026-09-26', unleadedLitres: 0, dieselLitres: 0 }
      ],
      [
        { date: '2025-09-25', unleadedLitres: 8576, dieselLitres: 3062 },
        { date: '2025-09-27', unleadedLitres: 9000, dieselLitres: 1000 }
      ],
      [],
      []
    )
    const days = buildDaysForMonth(2026, 9, maps)
    const recorded = lastRecordedFuelDay(days, '2026-09-27')
    assert.equal(recorded?.date, '2026-09-25')
    assert.equal(recorded?.gasLitresCur, 3262)
    assert.equal(lastRecordedFuelDay(days, '2026-09-24'), null)
  })

  it('uses the last recorded day in the current month and the last calendar day in an earlier month', () => {
    const september = buildDaysForMonth(
      2026,
      9,
      buildFuelVolumeMaps(
        [
          { date: '2026-09-25', unleadedLitres: 3262, dieselLitres: 1154 },
          { date: '2026-09-26', unleadedLitres: 0, dieselLitres: 0 }
        ],
        [{ date: '2025-09-27', unleadedLitres: 9000, dieselLitres: 1000 }],
        [],
        []
      )
    )
    const current = fuelComparisonWidgetDay(september, { year: 2026, month: 9 }, '2026-09-27')
    assert.equal(current?.day.date, '2026-09-25')
    assert.equal(current?.dayBasis, 'recorded')

    const august = buildDaysForMonth(
      2026,
      8,
      buildFuelVolumeMaps(
        [{ date: '2026-08-30', unleadedLitres: 4000, dieselLitres: 800 }],
        [{ date: '2025-08-31', unleadedLitres: 5000, dieselLitres: 900 }],
        [],
        []
      )
    )
    const earlier = fuelComparisonWidgetDay(august, { year: 2026, month: 8 }, '2026-09-27')
    assert.equal(earlier?.day.date, '2026-08-31')
    assert.equal(earlier?.dayBasis, 'month-end')
    assert.equal(earlier?.day.gasLitresCur, 0)
    assert.equal(earlier?.day.gasLitresPrev, 5000)

    assert.equal(fuelComparisonWidgetDay(september, { year: 2026, month: 10 }, '2026-09-27'), null)
  })
})
