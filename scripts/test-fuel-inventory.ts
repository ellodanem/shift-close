import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  UNLEADED_UNUSABLE_LITRES,
  DIESEL_UNUSABLE_LITRES,
  computeBook,
  computeFuelExpectancy,
  dipDeltasFromBook,
  harvestFuelVolumePatch,
  lastWeekdaySamples,
  openingBaselineConflict,
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
    assert.equal(usableLitres(8000, 'diesel'), 6500)
    assert.equal(usableLitres(1400, 'diesel'), 0)
    assert.equal(UNLEADED_UNUSABLE_LITRES, 2000)
    assert.equal(DIESEL_UNUSABLE_LITRES, 1500)
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
    assert.equal(book.usable.diesel, 8100)
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

  it('keeps the previous day behind an opening dated the next morning', () => {
    const book = computeBook(
      inputs({
        openings: [
          {
            ...opening,
            date: '2026-09-23',
            createdAt: '2026-09-23T08:50:00.000Z',
            unleadedLitres: 17046,
            dieselLitres: 9898
          }
        ],
        sales: [
          { date: '2026-09-22', shift: '6-1', unleaded: 3154, diesel: 1943 },
          { date: '2026-09-22', shift: '1-9', unleaded: 3990, diesel: 1902 },
          { date: '2026-09-23', shift: '6-1', unleaded: 2644, diesel: 2061 }
        ],
        deliveries: [{ date: '2026-09-22', unleadedLitres: 5000, dieselLitres: 1000 }]
      }),
      '2026-09-23'
    )
    assert.ok(book)
    assert.equal(book.sold.unleaded, 2644)
    assert.equal(book.sold.diesel, 2061)
    assert.equal(book.delivered.unleaded, 0)
    assert.equal(book.onHand.unleaded, 14402)
    assert.equal(book.onHand.diesel, 7837)
  })

  it('drops a same-day dip that was taken before a newer opening', () => {
    const book = computeBook(
      inputs({
        openings: [
          {
            ...opening,
            date: '2026-09-23',
            createdAt: '2026-09-23T22:30:00.000Z',
            unleadedLitres: 11893,
            dieselLitres: 6905
          }
        ],
        dips: [
          {
            id: 'd-old',
            date: '2026-09-23',
            createdAt: '2026-09-23T22:01:00.000Z',
            unleadedLitres: 11893,
            dieselLitres: 6905,
            unleadedDelta: 4634.9,
            dieselDelta: 2912.8,
            notes: '',
            createdBy: 'admin'
          }
        ],
        sales: [{ date: '2026-09-22', shift: '6-1', unleaded: 7000, diesel: 3000 }]
      }),
      '2026-09-23'
    )
    assert.ok(book)
    assert.equal(book.dipAdjust.unleaded, 0)
    assert.equal(book.dipAdjust.diesel, 0)
    assert.equal(book.onHand.unleaded, 11893)
    assert.equal(book.onHand.diesel, 6905)
  })

  it('keeps a dip taken later the same day as the opening', () => {
    const book = computeBook(
      inputs({
        openings: [
          {
            ...opening,
            date: '2026-09-23',
            createdAt: '2026-09-23T08:50:00.000Z',
            unleadedLitres: 17046,
            dieselLitres: 9898
          }
        ],
        dips: [
          {
            id: 'd-later',
            date: '2026-09-23',
            createdAt: '2026-09-23T22:01:00.000Z',
            unleadedLitres: 14000,
            dieselLitres: 7800,
            unleadedDelta: -400,
            dieselDelta: -100,
            notes: '',
            createdBy: 'admin'
          }
        ],
        sales: [{ date: '2026-09-23', shift: '6-1', unleaded: 2644, diesel: 2061 }]
      }),
      '2026-09-23'
    )
    assert.ok(book)
    assert.equal(book.dipAdjust.unleaded, -400)
    assert.equal(book.onHand.unleaded, 14002)
    assert.equal(book.onHand.diesel, 7737)
  })

  it('asks for the next morning when the opening date already has movements', () => {
    const conflict = openingBaselineConflict('2026-09-22', {
      sold: { unleaded: 7143.74, diesel: 3845.2 },
      delivered: { unleaded: 0, diesel: 0 }
    })
    assert.ok(conflict)
    assert.equal(conflict.nextDate, '2026-09-23')
    assert.equal(conflict.sold.unleaded, 7143.7)
    assert.equal(
      openingBaselineConflict('2026-09-24', {
        sold: { unleaded: 0, diesel: 0 },
        delivered: { unleaded: 0, diesel: 0 }
      }),
      null
    )
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

describe('harvest fuel invoice volume backfill', () => {
  it('fills only blank litre fields and treats zero as real', () => {
    assert.deepEqual(
      harvestFuelVolumePatch(
        { unleadedLitres: null, dieselLitres: null },
        { unleadedLitres: 15138, dieselLitres: 7592 }
      ),
      { unleadedLitres: 15138, dieselLitres: 7592 }
    )
    assert.deepEqual(
      harvestFuelVolumePatch(
        { unleadedLitres: 100, dieselLitres: null },
        { unleadedLitres: 15138, dieselLitres: 7592 }
      ),
      { dieselLitres: 7592 }
    )
    assert.equal(
      harvestFuelVolumePatch(
        { unleadedLitres: 15138, dieselLitres: 7592 },
        { unleadedLitres: 1, dieselLitres: 2 }
      ),
      null
    )
    assert.deepEqual(
      harvestFuelVolumePatch(
        { unleadedLitres: null, dieselLitres: null },
        { unleadedLitres: 0, dieselLitres: 0 }
      ),
      { unleadedLitres: 0, dieselLitres: 0 }
    )
  })
})
