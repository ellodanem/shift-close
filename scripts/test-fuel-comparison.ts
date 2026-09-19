import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { litresToGallons } from '../lib/fuel-constants'
import {
  buildDaysForMonth,
  buildFuelVolumeMaps,
  buildMonthsForYear,
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
})
