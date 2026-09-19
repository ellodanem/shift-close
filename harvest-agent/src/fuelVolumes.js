/**
 * Parse Cstore Gas Delivery volumes.
 * List cells look like "15138.000\\nLoad 1\\n@ $3.55/Gal".
 * Detail "Net volume purchased" is the same figure (litres, three decimal places).
 */

function parseCstoreVolume(text) {
  const raw = String(text || '')
  const threeDec = raw.replace(/,/g, '').match(/(\d+\.\d{3})\b/)
  if (threeDec) {
    const n = Number(threeDec[1])
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const withoutMoney = raw.replace(/\$\s*[\d,]+(\.\d+)?/g, ' ').replace(/,/g, '')
  const m = withoutMoney.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Regular + Plus + Super → unleaded pool. Missing grades are ignored; all-zero stays 0. */
function gasolineUnleadedLitres(grades) {
  const parts = [grades?.regular, grades?.plus, grades?.superGrade]
    .map((n) => (n == null ? null : Number(n)))
    .filter((n) => n != null && Number.isFinite(n) && n >= 0)
  if (!parts.length) return null
  const sum = parts.reduce((a, b) => a + b, 0)
  return Math.round(sum * 1000) / 1000
}

function dieselLitres(value) {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 1000) / 1000
}

/** Modal Net volume purchased wins when present; otherwise list Regular/Plus/Super/Diesel. */
function mergeDeliveryVolumes(listRow, modalGrades) {
  const regular = modalGrades?.regular ?? listRow?.regular ?? null
  const plus = modalGrades?.plus ?? listRow?.plus ?? null
  const superGrade = modalGrades?.superGrade ?? listRow?.superGrade ?? null
  const diesel = modalGrades?.diesel ?? listRow?.diesel ?? null
  return {
    unleadedLitres: gasolineUnleadedLitres({ regular, plus, superGrade }),
    dieselLitres: dieselLitres(diesel)
  }
}

module.exports = {
  parseCstoreVolume,
  gasolineUnleadedLitres,
  dieselLitres,
  mergeDeliveryVolumes
}
