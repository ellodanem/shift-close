const { usDateInMonth } = require('./invoiceMonth')

/** Keep purchase rows whose date is in the requested month. */
function rowsForVendorImport(rows, { year, month }) {
  const list = Array.isArray(rows) ? rows : []
  const kept = []
  let rejected = 0
  for (const row of list) {
    if (!usDateInMonth(row.invoiceDate, year, month)) {
      rejected++
      continue
    }
    kept.push(row)
  }
  return { kept, rejected }
}

module.exports = { rowsForVendorImport }
