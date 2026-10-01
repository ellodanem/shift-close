/**
 * Group Cstore "By Check/EFT" rows into one check per check number.
 * EFT and anything that is not a numbered check are left out.
 */

function collapseText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalCheckNumber(digits) {
  const stripped = String(digits || '').replace(/^0+/, '')
  return stripped || '0'
}

function parsePaymentType(value) {
  const text = collapseText(value)
  if (!text) return { kind: 'other' }

  const check = text.match(/\bche(?:ck|que)\b[^0-9]{0,24}(\d+)/i)
  if (check) {
    return { kind: 'check', number: canonicalCheckNumber(check[1]) }
  }
  if (/\beft\b|electronic|direct debit|direct transfer/i.test(text)) {
    return { kind: 'eft' }
  }
  return { kind: 'other' }
}

function parseUsDateToYmd(value) {
  const m = String(value || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function rowKey(row) {
  return `${row.invoiceNumber}|${row.invoiceDate}|${row.amount}`
}

function groupVendorChecks(rows) {
  const byNumber = new Map()
  let skippedEft = 0
  let skippedOther = 0

  for (const row of rows || []) {
    const parsed = parsePaymentType(row.paymentType)
    if (parsed.kind === 'eft') {
      skippedEft += 1
      continue
    }
    if (parsed.kind !== 'check') {
      skippedOther += 1
      continue
    }

    const invoiceNumber = String(row.invoiceNumber || '').trim()
    const invoiceDate = String(row.invoiceDate || '').trim()
    const amount = Number(row.amount)
    if (!invoiceNumber || !invoiceDate || !Number.isFinite(amount) || amount <= 0) {
      skippedOther += 1
      continue
    }

    if (!byNumber.has(parsed.number)) byNumber.set(parsed.number, [])
    const list = byNumber.get(parsed.number)
    const next = { invoiceNumber, invoiceDate, amount }
    if (list.some((existing) => rowKey(existing) === rowKey(next))) continue
    list.push(next)
  }

  const checks = []
  for (const [checkNumber, invoices] of byNumber) {
    const paymentDate =
      invoices
        .map((invoice) => parseUsDateToYmd(invoice.invoiceDate))
        .filter(Boolean)
        .sort()
        .at(-1) || ''
    checks.push({ checkNumber, paymentDate, invoices })
  }
  checks.sort((a, b) => a.checkNumber.localeCompare(b.checkNumber, undefined, { numeric: true }))
  return { checks, skippedEft, skippedOther }
}

module.exports = {
  parsePaymentType,
  parseUsDateToYmd,
  groupVendorChecks,
  canonicalCheckNumber
}
