import { roundMoney } from '@/lib/fuelPayments'

export type ParsedCreditReportLine = {
  date: string // YYYY-MM-DD
  charges: number
  payments: number
  memo: string
}

export type ParsedCreditReport = {
  opening: number
  lines: ParsedCreditReportLine[]
  summary: {
    totalCharges: number
    totalPayments: number
    closing: number
  }
}

/** Parse currency from Cstore export cells ($1,234.56 or plain number). */
export function parseCstoreMoney(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return roundMoney(value)
  if (typeof value !== 'string') return 0
  const cleaned = value
    .replace(/[\$,]/g, '')
    .replace(/\s+/g, '')
    .trim()
  const n = Number(cleaned)
  return Number.isNaN(n) ? 0 : roundMoney(n)
}

/** M/D/YYYY or MM/DD/YYYY → YYYY-MM-DD */
export function parseCstoreDate(raw: string, defaultYear?: number): string | null {
  const s = raw.trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const month = Number(m[1])
    const day = Number(m[2])
    const year = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (m2 && defaultYear) {
    const month = Number(m2[1])
    const day = Number(m2[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${defaultYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n</tr>')
    .replace(/<\/td>/gi, '|</td>')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
}

/** Parse Cstore Customer Credit Report (HTML saved as .xls). */
export function parseCustomerCreditReportHtml(html: string): ParsedCreditReport {
  const text = stripHtml(html)
  let opening = 0
  const openMatch = text.match(/Opening\s*Balance:\s*\$?([\d,]+\.?\d*)/i)
  if (openMatch) opening = parseCstoreMoney(openMatch[1])

  const lines: ParsedCreditReportLine[] = []
  const rowRegex =
    /(\d{1,2}\/\d{1,2}\/\d{4})[\s\S]*?\$?([\d,]+\.?\d*)[\s\S]*?\$?([\d,]+\.?\d*)/g

  // Walk <tr> chunks for more reliable parsing
  const trChunks = html.split(/<tr\b/i).slice(1)
  let inferredYear: number | undefined
  for (const chunk of trChunks) {
    const dateMatch = chunk.match(/>(\d{1,2}\/\d{1,2}\/\d{4})</)
    if (!dateMatch) continue
    const dateStr = dateMatch[1]
    inferredYear = Number(dateStr.split('/')[2])
    const iso = parseCstoreDate(dateStr)
    if (!iso) continue

    const moneyMatches = [...chunk.matchAll(/\$([\d,]+\.\d{2})/g)].map((m) =>
      parseCstoreMoney(m[1])
    )
    if (moneyMatches.length < 3) continue

    const charges = moneyMatches[0] ?? 0
    const payments = moneyMatches[1] ?? 0
    const memoMatch = chunk.match(/Invoice no\/Memo[\s\S]*?<td[^>]*>[\s\S]*?<div[^>]*>([^<]*)</i)
    const memo = memoMatch ? memoMatch[1].trim() : ''

    if (charges > 0 || payments > 0) {
      lines.push({ date: iso, charges, payments, memo })
    }
  }

  // Fallback if tr parsing found nothing
  if (lines.length === 0 && inferredYear) {
    let match: RegExpExecArray | null
    const simpleRow = /<tr>[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{4})[\s\S]*?\$([\d,]+\.\d{2})[\s\S]*?\$([\d,]+\.\d{2})/gi
    while ((match = simpleRow.exec(html)) !== null) {
      const iso = parseCstoreDate(match[1])
      if (!iso) continue
      const charges = parseCstoreMoney(match[2])
      const payments = parseCstoreMoney(match[3])
      if (charges > 0 || payments > 0) {
        lines.push({ date: iso, charges, payments, memo: '' })
      }
    }
  }

  lines.sort((a, b) => a.date.localeCompare(b.date))

  let totalCharges = 0
  let totalPayments = 0
  let closing = opening

  const summaryCharges = text.match(/Total\s*charges:\s*\$?([\d,]+\.?\d*)/i)
  const summaryPayments = text.match(/Payments:\s*\$?([\d,]+\.?\d*)/i)
  const summaryClosing = text.match(/Closing\s*balance:\s*\$?([\d,]+\.?\d*)/i)

  if (summaryCharges) totalCharges = parseCstoreMoney(summaryCharges[1])
  else totalCharges = roundMoney(lines.reduce((s, l) => s + l.charges, 0))

  if (summaryPayments) totalPayments = parseCstoreMoney(summaryPayments[1])
  else totalPayments = roundMoney(lines.reduce((s, l) => s + l.payments, 0))

  if (summaryClosing) closing = parseCstoreMoney(summaryClosing[1])
  else {
    for (const line of lines) {
      closing = roundMoney(closing + line.charges - line.payments)
    }
  }

  return {
    opening,
    lines,
    summary: {
      totalCharges,
      totalPayments,
      closing
    }
  }
}

/** Expand parsed report rows into ledger charge/payment entries. */
export function creditReportToLedgerEntries(
  parsed: ParsedCreditReport
): Array<{
  date: string
  lineType: 'charge' | 'payment'
  amount: number
  memo: string
  sortOrder: number
}> {
  const out: Array<{
    date: string
    lineType: 'charge' | 'payment'
    amount: number
    memo: string
    sortOrder: number
  }> = []
  let order = 0
  for (const line of parsed.lines) {
    if (line.charges > 0) {
      out.push({
        date: line.date,
        lineType: 'charge',
        amount: line.charges,
        memo: line.memo,
        sortOrder: order++
      })
    }
    if (line.payments > 0) {
      out.push({
        date: line.date,
        lineType: 'payment',
        amount: line.payments,
        memo: line.memo,
        sortOrder: order++
      })
    }
  }
  return out
}

export type LedgerRowWithRunning = {
  id: string
  date: string
  lineType: 'charge' | 'payment'
  amount: number
  charges: number
  payments: number
  runningTotal: number
  memo: string | null
  paymentMethod: string | null
  ref: string | null
  source: string
  paymentId: string | null
}

/** Compute Cstore-style running balance from opening + ordered lines. */
export function computeLedgerWithRunning(
  opening: number,
  lines: Array<{
    id: string
    date: string
    lineType: string
    amount: number
    memo: string | null
    paymentMethod: string | null
    ref: string | null
    source: string
    paymentId: string | null
    sortOrder: number
  }>
): LedgerRowWithRunning[] {
  const sorted = [...lines].sort((a, b) => {
    const d = a.date.localeCompare(b.date)
    if (d !== 0) return d
    return a.sortOrder - b.sortOrder
  })

  let running = roundMoney(opening)
  return sorted.map((line) => {
    const isCharge = line.lineType === 'charge'
    const charges = isCharge ? line.amount : 0
    const payments = isCharge ? 0 : line.amount
    running = roundMoney(running + charges - payments)
    return {
      id: line.id,
      date: line.date,
      lineType: (isCharge ? 'charge' : 'payment') as 'charge' | 'payment',
      amount: line.amount,
      charges,
      payments,
      runningTotal: running,
      memo: line.memo,
      paymentMethod: line.paymentMethod,
      ref: line.ref,
      source: line.source,
      paymentId: line.paymentId
    }
  })
}
