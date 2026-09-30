import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatMeterVariance,
  isBeforeShift,
  meterLitres,
  meterPatchFromBody,
  meterVariance,
  parseMeterField,
  pickMeterCarry
} from '../lib/shift-meter'

describe('shift meter readings', () => {
  it('calculates litres through the pump and the variance against CStore', () => {
    const unleaded = meterLitres(1204880, 1209710, 18)
    assert.equal(unleaded, 4812)
    assert.equal(meterVariance(unleaded, 4812.4), -0.4)

    const diesel = meterLitres(886440, 889552, null)
    assert.equal(diesel, 3112)
    assert.equal(meterVariance(diesel, 3105.2), 6.8)
    assert.equal(formatMeterVariance(6.8), '+6.80 L')
    assert.equal(formatMeterVariance(0), '0')
  })

  it('leaves the result blank until both open and close are entered', () => {
    assert.equal(meterLitres(null, 100, 0), null)
    assert.equal(meterLitres(100, null, 0), null)
    assert.equal(meterVariance(null, 10), null)
  })

  it('rejects blank and negative inputs and keeps zero', () => {
    assert.equal(parseMeterField(''), null)
    assert.equal(parseMeterField(null), null)
    assert.equal(parseMeterField(-1), null)
    assert.equal(parseMeterField(0), 0)
    assert.equal(parseMeterField('18.5'), 18.5)
  })

  it('orders the morning shift before the afternoon shift on the same day', () => {
    assert.equal(isBeforeShift({ date: '2026-09-30', shift: '6-1' }, { date: '2026-09-30', shift: '1-9' }), true)
    assert.equal(isBeforeShift({ date: '2026-09-30', shift: '1-9' }, { date: '2026-09-30', shift: '6-1' }), false)
    assert.equal(isBeforeShift({ date: '2026-09-29', shift: '1-9' }, { date: '2026-09-30', shift: '6-1' }), true)
  })

  it('carries each grade from the latest earlier close', () => {
    const carry = pickMeterCarry(
      [
        { date: '2026-09-29', shift: '6-1', unleadedMeterClose: 100, dieselMeterClose: 50 },
        { date: '2026-09-29', shift: '1-9', unleadedMeterClose: 180, dieselMeterClose: null },
        { date: '2026-09-30', shift: '1-9', unleadedMeterClose: 900, dieselMeterClose: 900 }
      ],
      { date: '2026-09-30', shift: '6-1' }
    )
    assert.equal(carry.unleadedOpen, 180)
    assert.equal(carry.unleadedSource?.shift, '1-9')
    assert.equal(carry.dieselOpen, 50)
    assert.equal(carry.dieselSource?.shift, '6-1')
  })

  it('records a correction only when a reading changes', () => {
    const patch = meterPatchFromBody(
      { unleadedMeterClose: 1209710, dieselMeterTest: '' },
      { unleadedMeterClose: 1209710, dieselMeterTest: 4 }
    )
    assert.equal(patch.data.unleadedMeterClose, 1209710)
    assert.equal(patch.data.dieselMeterTest, null)
    assert.deepEqual(
      patch.changes.map((change) => change.field),
      ['dieselMeterTest']
    )
  })
})
