import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  UNLEADED_UNUSABLE_LITRES,
  DIESEL_UNUSABLE_LITRES,
  computeBook,
  computeFuelExpectancy,
  dipDeltasFromBook,
  lastWeekdaySamples,
  usableLitres,
  weekendEndYmd,
  weekdayIndexFromYmd,
  type FuelInventoryInputs
} from '../lib/fuel-inventory'

const opening = {
  id: 'o1',
  date: '2026-09-01',
  createdAt: '2026-09-01T12:00:00.000Z',
  unleadedLitres: 12000,
  dieselLitres: 8000,
  notes: '',
  createdBy: 'admin'
}

function inputs(partial: Partial<FuelInventoryInputs> = {}): FuelInventoryInputs {
  return {
    openings: partial.openings ?? [opening],
    dips: partial.dips ?? [],
    deliveries: partial.deliveries ?? [],
    sales: partial.sales ?? []
  }
}

describe('fuel inventory book', () => {
  it('subtracts unusable reserves only for forecasts', () => {
    assert.equal(usableLitres(12000, 'unleaded'), 10000)
    assert.equal(usableLitres(1500, 'unleaded'), 0)
    assert.equal(usableLitres(8000, 'diesel'), 7000)
    assert.equal(usableLitres(900, 'diesel'), 0)
    assert.equal(UNLEADED_UNUSABLE_LITRES, 2000)
    assert.equal(DIESEL_UNUSABLE_LITRES, 1000)
  })

  it('replays opening + same-day deliveries - sales', () => {
    const book = computeBook(
      inputs({
        deliveries: [
          { date: '2026-09-01', unleadedLitres: 4000, dieselLitres: 2000 },
          { date: '2026-08-31', unleadedLitres: 9999, dieselLitres: 9999 }
        ],
        sales: [
          { date: '2026-09-01', shift: '6-1', unleaded: 1500, diesel: 400 },
          { date: '2026-08-31', shift: '1-9', unleaded: 800, diesel: 200 }
        ]
      }),
      '2026-09-01'
    )
    assert.ok(book)
    assert.equal(book.onHand.unleaded, 14500)
    assert.equal(book.onHand.diesel, 9600)
    assert.equal(book.usable.unleaded, 12500)
    assert.equal(book.usable.diesel, 8600)
  })

  it('ignores null invoice litres and counts zero', () => {
    const book = computeBook(
      inputs({
        deliveries: [
          { date: '2026-09-02', unleadedLitres: 1000, dieselLitres: null },
          { date: '2026-09-02', unleadedLitres: 0, dieselLitres: 0 }
        ]
      }),
      '2026-09-02'
    )
    assert.ok(book)
    assert.equal(book.delivered.unleaded, 1000)
    assert.equal(book.delivered.diesel, 0)
    assert.equal(book.onHand.unleaded, 13000)
  })

  it('uses the latest opening and applies later dip deltas', () => {
    const book = computeBook(
      inputs({
        openings: [
          opening,
          {
            ...opening,
            id: 'o2',
            date: '2026-09-10',
            createdAt: '2026-09-10T12:00:00.000Z',
            unleadedLitres: 9000,
            dieselLitres: 5000
          }
        ],
        deliveries: [{ date: '2026-09-11', unleadedLitres: 500, dieselLitres: 100 }],
        sales: [{ date: '2026-09-11', shift: '6-1', unleaded: 200, diesel: 50 }],
        dips: [
          {
            id: 'd1',
            date: '2026-09-11',
            createdAt: '2026-09-11T18:00:00.000Z',
            unleadedLitres: 9250,
            dieselLitres: 5040,
            unleadedDelta: -50,
            dieselDelta: -10,
            notes: 'dip',
            createdBy: 'admin'
          }
        ]
      }),
      '2026-09-11'
    )
    assert.ok(book)
    assert.equal(book.opening.id, 'o2')
    assert.equal(book.onHand.unleaded, 9250)
    assert.equal(book.onHand.diesel, 5040)
  })

  it('stores dip as the difference from current book', () => {
    const book = computeBook(inputs(), '2026-09-01')
    assert.ok(book)
    const delta = dipDeltasFromBook(book, { unleaded: 11800, diesel: 7900 })
    assert.equal(delta.unleaded, -200)
    assert.equal(delta.diesel, -100)
  })
})

describe('fuel expectancy forecasts', () => {
  it('uses Friday averages for a Friday remaining-today check', () => {
    const fridays = [
      '2026-06-05',
      '2026-06-12',
      '2026-06-19',
      '2026-06-26',
      '2026-07-03',
      '2026-07-10',
      '2026-07-17',
      '2026-07-24',
      '2026-07-31',
      '2026-08-07',
      '2026-08-14',
      '2026-08-21'
    ]
    const fridaySales = fridays.flatMap((date) => [
      { date, shift: '6-1', unleaded: 3000, diesel: 800 },
      { date, shift: '1-9', unleaded: 2000, diesel: 400 }
    ])
    const result = computeFuelExpectancy(
      inputs({
        sales: fridaySales
      }),
      '2026-09-18'
    )
    assert.equal(weekdayIndexFromYmd('2026-09-18'), 5)
    assert.equal(result.todayAverage?.samples, 12)
    assert.equal(result.todayAverage?.typical.unleaded, 5000)
    assert.equal(result.remainingTodayTypical.unleaded, 5000)
    const rest = result.horizons.find((h) => h.id === 'restOfToday')
    assert.ok(rest)
    assert.equal(rest.typical.unleaded.enough, true)
    assert.equal(usableLitres(12000, 'unleaded'), 10000)
  })

  it('skips closed (zero) weekdays in the sample window', () => {
    const daily = [
      { date: '2026-08-07', unleaded: 4000, diesel: 1000 },
      { date: '2026-08-14', unleaded: 0, diesel: 0 },
      { date: '2026-08-21', unleaded: 4200, diesel: 1100 }
    ]
    const samples = lastWeekdaySamples(daily, 5, '2026-09-18')
    assert.equal(samples.length, 2)
  })

  it('treats weekend end as the coming Sunday', () => {
    assert.equal(weekendEndYmd('2026-09-18'), '2026-09-20')
    assert.equal(weekendEndYmd('2026-09-20'), '2026-09-20')
    assert.equal(weekendEndYmd('2026-09-16'), '2026-09-20')
  })

  it('flags a short typical Friday when usable is below remaining demand', () => {
    const fridays = [
      '2026-06-05',
      '2026-06-12',
      '2026-06-19',
      '2026-06-26',
      '2026-07-03',
      '2026-07-10',
      '2026-07-17',
      '2026-07-24',
      '2026-07-31',
      '2026-08-07',
      '2026-08-14',
      '2026-08-21'
    ]
    const result = computeFuelExpectancy(
      inputs({
        openings: [
          {
            ...opening,
            unleadedLitres: 2500,
            dieselLitres: 1200
          }
        ],
        sales: fridays.map((date) => ({ date, shift: '6-1', unleaded: 4000, diesel: 900 }))
      }),
      '2026-09-18'
    )
    const rest = result.horizons.find((h) => h.id === 'restOfToday')
    assert.ok(rest)
    assert.equal(rest.typical.unleaded.enough, false)
    assert.ok(rest.typical.unleaded.shortBy > 0)
    assert.equal(result.book?.usable.unleaded, 500)
  })
})
