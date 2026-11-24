const { usDateInMonth } = require('./invoiceMonth')

function normalizeVendorKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
}

function isRubisWestIndiesVendor(name) {
  return /rubis\s*west\s*indies/i.test(String(name || '').trim())
}

/** Blank vendor column means the selected vendor; a different name is another payee. */
function cstoreRowVendorMatches(rowVendor, selectedVendor) {
  const named = normalizeVendorKey(rowVendor || '')
  if (!named) return true
  return named === normalizeVendorKey(selectedVendor)
}

/**
 * Keep purchase rows for the requested month and, when known, the selected vendor.
 * Other vendors on the same Cstore list are left out so they are not imported under the wrong payee.
 */
function rowsForVendorImport(rows, { year, month, confirmedVendor } = {}) {
  const list = Array.isArray(rows) ? rows : []
  const kept = []
  let rejected = 0
  const selected = String(confirmedVendor || '').trim()
  for (const row of list) {
    const named = String(row.vendor || '').trim()
    if (isRubisWestIndiesVendor(named)) {
      rejected++
      continue
    }
    if (selected && !cstoreRowVendorMatches(named, selected)) {
      rejected++
      continue
    }
    if (!usDateInMonth(row.invoiceDate, year, month)) {
      rejected++
      continue
    }
    kept.push(row)
  }
  return { kept, rejected }
}

module.exports = { rowsForVendorImport, cstoreRowVendorMatches, normalizeVendorKey }
