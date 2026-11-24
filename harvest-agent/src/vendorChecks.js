/**
 * Group Cstore "By Check/EFT" rows into one payment per check number or EFT reference.
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
    const numbered = text.match(/(\d+)/)
    return { kind: 'eft', number: numbered ? canonicalCheckNumber(numbered[1]) : 'EFT' }
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
  const byKey = new Map()
  let skippedEft = 0
  let skippedOther = 0

  for (const row of rows || []) {
    const parsed = parsePaymentType(row.paymentType)
    if (parsed.kind !== 'check' && parsed.kind !== 'eft') {
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

    const number = parsed.number || (parsed.kind === 'eft' ? 'EFT' : '')
    if (!number) {
      skippedOther += 1
      continue
    }
    const key = `${parsed.kind}:${number}`
    if (!byKey.has(key)) byKey.set(key, { kind: parsed.kind, number, invoices: [] })
    const list = byKey.get(key).invoices
    const next = { invoiceNumber, invoiceDate, amount }
    if (list.some((existing) => rowKey(existing) === rowKey(next))) continue
    list.push(next)
  }

  const checks = []
  for (const { kind, number, invoices } of byKey.values()) {
    const paymentDate =
      invoices
        .map((invoice) => parseUsDateToYmd(invoice.invoiceDate))
        .filter(Boolean)
        .sort()
        .at(-1) || ''
    checks.push({
      checkNumber: number,
      paymentDate,
      paymentMethod: kind,
      invoices
    })
  }
  checks.sort((a, b) => {
    const method = String(a.paymentMethod).localeCompare(String(b.paymentMethod))
    if (method) return method
    return a.checkNumber.localeCompare(b.checkNumber, undefined, { numeric: true })
  })
  return { checks, skippedEft, skippedOther }
}

module.exports = {
  parsePaymentType,
  parseUsDateToYmd,
  groupVendorChecks,
  canonicalCheckNumber
}
