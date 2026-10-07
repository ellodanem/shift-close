const { usDateInMonth } = require('./invoiceMonth')

function isRubisWestIndiesVendor(name) {
  return /rubis\s*west\s*indies/i.test(String(name || '').trim())
}

/**
 * LPG invoices are Rubis West Indies grocery purchases for one month.
 * A blank vendor is filled in only when every row is blank and the vendor
 * dropdown was confirmed as Rubis. Any other vendor is left out.
 */
function rowsForLpgImport(rows, { year, month, confirmedVendor }) {
  const list = Array.isArray(rows) ? rows : []
  const anyNamed = list.some((row) => String(row.vendor || '').trim())
  const stamp =
    !anyNamed && confirmedVendor && isRubisWestIndiesVendor(confirmedVendor)
      ? String(confirmedVendor).trim()
      : ''
  const kept = []
  let rejected = 0
  for (const row of list) {
    const named = String(row.vendor || '').trim()
    const vendor = named || stamp
    if (!isRubisWestIndiesVendor(vendor) || !usDateInMonth(row.invoiceDate, year, month)) {
      rejected++
      continue
    }
    kept.push({ ...row, vendor })
  }
  return { kept, rejected }
}

module.exports = { isRubisWestIndiesVendor, rowsForLpgImport }
