const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseCstoreVolume, gasolineUnleadedLitres, dieselLitres, mergeDeliveryVolumes } = require('./fuelVolumes')

describe('Cstore gas delivery volumes', () => {
  it('reads net/list litres and ignores $/Gal price', () => {
    assert.equal(parseCstoreVolume('15138.000\nLoad 1\n@ $3.55/Gal'), 15138)
    assert.equal(parseCstoreVolume('7592.000'), 7592)
    assert.equal(parseCstoreVolume('0.000'), 0)
    assert.equal(parseCstoreVolume('14,422.000'), 14422)
  })

  it('sums Regular + Plus + Super into unleaded', () => {
    assert.equal(
      gasolineUnleadedLitres({ regular: 15138, plus: 0, superGrade: 0 }),
      15138
    )
    assert.equal(
      gasolineUnleadedLitres({ regular: 10000, plus: 200, superGrade: 50 }),
      10250
    )
    assert.equal(gasolineUnleadedLitres({}), null)
  })

  it('keeps diesel as its own grade', () => {
    assert.equal(dieselLitres(7592), 7592)
    assert.equal(dieselLitres(0), 0)
    assert.equal(dieselLitres(null), null)
  })

  it('prefers modal net volumes over list cells', () => {
    assert.deepEqual(
      mergeDeliveryVolumes(
        { regular: 15138, plus: 0, superGrade: 0, diesel: 7592 },
        { regular: 15138, plus: 0, superGrade: 0, diesel: 7592 }
      ),
      { unleadedLitres: 15138, dieselLitres: 7592 }
    )
    assert.deepEqual(
      mergeDeliveryVolumes(
        { regular: 11111, plus: 0, superGrade: 0, diesel: 1 },
        { regular: 15138, plus: 0, superGrade: 0, diesel: 7592 }
      ),
      { unleadedLitres: 15138, dieselLitres: 7592 }
    )
    assert.deepEqual(
      mergeDeliveryVolumes({ regular: 15138, plus: 0, superGrade: 0, diesel: 7592 }, null),
      { unleadedLitres: 15138, dieselLitres: 7592 }
    )
  })
})
