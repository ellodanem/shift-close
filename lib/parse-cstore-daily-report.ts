/**
 * Parse the Cstore printable Daily Report (DailyReportGetPrintable.aspx) into the figures
 * End of Day V2 compares against.
 *
 * The page is a set of label/value tables: Sales and Collections side by side (Type, Count, Amount),
 * then a Daily Tank Report with one column per grade. The parser reads by label, not by position or
 * element ids, so it tolerates layout changes. Fuel is litres even though Cstore says "gal".
 */

export type ParsedCstoreDailyReport = {
  date: string | null // YYYY-MM-DD, read from the page when it shows one
  grocery: number
  salesTax: number
  regularAmt: number
  dieselAmt: number
  custAccountPayIn: number
  totalSales: number
  depositsTyped: number
  fleetBatch: number
  creditDebitBatch: number
  custAccountSales: number
  totalCollections: number
  shortOver: number
  regularLitres: number
  dieselLitres: number
  tank: {
    regular: TankGrade
    diesel: TankGrade
  }
}

type TankGrade = {
  opening: number | null
  purchase: number | null
  closing: number | null
  stick: number | null
  os: number | null
}

export type CstoreParseResult =
  | { ok: true; report: ParsedCstoreDailyReport }
  | { ok: false; code: 'not_a_report' | 'missing_labels'; message: string; missing: string[] }

const MONEY_RE = /^\(?\s*[-+]?\s*\$?\s*[-+]?\s*[\d,]*\.?\d+\s*\)?$/

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
}

/** Text of a fragment as lines: <br> and block ends start a new line, everything else is collapsed. */
function cleanLines(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(div|p|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '')
}

function cleanText(html: string): string {
  return cleanLines(html).join(' ')
}

/**
 * Every table row as a list of cell texts (empty cells kept so columns stay aligned).
 * A row whose cells hold stacked lines (for example "Total Collections / Short Over" over two amounts)
 * is split into one row per line when every stacked cell has the same number of lines.
 */
export function htmlRows(html: string): string[][] {
  const rows: string[][] = []
  for (const chunk of html.split(/<tr\b/i).slice(1)) {
    const row = chunk.split(/<\/tr>/i)[0]
    const cellLines: string[][] = []
    const re = /<t[dh]\b[^>]*>([\s\S]*?)(?=<\/t[dh]>|<t[dh]\b|$)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(row))) cellLines.push(cleanLines(m[1]))
    if (cellLines.length === 0) continue
    const k = Math.max(...cellLines.map((l) => l.length))
    const stackable = k > 1 && cellLines.every((l) => l.length === 0 || l.length === 1 || l.length === k)
    if (stackable) {
      for (let line = 0; line < k; line++) {
        rows.push(cellLines.map((l) => (l.length === k ? l[line] : line === 0 ? (l[0] ?? '') : '')))
      }
    } else {
      rows.push(cellLines.map((l) => l.join(' ')))
    }
  }
  return rows
}

function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[:]/g, '')
    .replace(/[/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseMoneyCell(text: string): number | null {
  const t = text.trim()
  if (!t || !MONEY_RE.test(t)) return null
  const negative = /^\(.*\)$/.test(t) || /-/.test(t)
  const digits = t.replace(/[^\d.]/g, '')
  if (!digits) return null
  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

function isNumeric(text: string): boolean {
  return parseMoneyCell(text) !== null
}

const SALES_LABELS: Record<string, string> = {
  'total grocery': 'grocery',
  'sales tax': 'salesTax',
  'regular amt sold': 'regularAmt',
  'plus amt sold': 'plusAmt',
  'super amt sold': 'superAmt',
  'diesel amt sold': 'dieselAmt',
  'cust account pay-in': 'custAccountPayIn',
  'cust account pay in': 'custAccountPayIn',
  'total sales': 'totalSales'
}

const COLLECTION_LABELS: Record<string, string> = {
  'total deposits': 'depositsTyped',
  'credit card batches': 'fleetBatch',
  'credit card batch': 'fleetBatch',
  'credit card 2 batch': 'creditDebitBatch',
  'credit card 2 batches': 'creditDebitBatch',
  'cust account sales': 'custAccountSales',
  'total collections': 'totalCollections',
  'short over': 'shortOver'
}

const LABELS: Record<string, string> = { ...SALES_LABELS, ...COLLECTION_LABELS }

/**
 * For each known label in a row, the amount is the last number between that label and the next
 * text cell (the Count column may be blank or hold a count, Amount comes after it).
 */
/** Cells that carry no value: blanks, a lone currency symbol or a dash in the Count column. */
function isFiller(text: string): boolean {
  return /^[\s$\-–—]*$/.test(text)
}

function readLabelledAmounts(rows: string[][]): Map<string, number> {
  const out = new Map<string, number>()
  for (const cells of rows) {
    for (let i = 0; i < cells.length; i++) {
      const key = LABELS[normalizeLabel(cells[i])]
      if (!key || out.has(key)) continue
      let value: number | null = null
      for (let j = i + 1; j < cells.length; j++) {
        const cell = cells[j]
        if (isFiller(cell)) continue
        if (!isNumeric(cell)) break
        value = parseMoneyCell(cell)
      }
      if (value !== null) out.set(key, value)
    }
  }
  return out
}

const MONEY_TOKEN = /(?:\(\s*\$?\s*[\d,]+(?:\.\d+)?\s*\)|-?\s*\$\s*-?\s*[\d,]+(?:\.\d+)?)/

function labelPattern(label: string): RegExp {
  const body = label
    .split(/[\s-]+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s-]*')
  return new RegExp(`${body}\\s*:?`, 'i')
}

/**
 * Fallback for labels the row reader missed (a layout with the "$" or the amount in an unexpected
 * cell): read the page as one stream of text and take the first "$" amount after the label, as long as
 * no other words sit between them (the Count column is digits only).
 */
function fillFromTextStream(html: string, out: Map<string, number>): void {
  const text = cleanText(html)
  for (const label of Object.keys(LABELS)) {
    const key = LABELS[label]
    if (out.has(key)) continue
    const m = labelPattern(label).exec(text)
    if (!m) continue
    const after = text.slice(m.index + m[0].length)
    const token = MONEY_TOKEN.exec(after)
    if (!token) continue
    const gap = after.slice(0, token.index)
    if (/[A-Za-z]/.test(gap)) continue
    const value = parseMoneyCell(token[0])
    if (value !== null) out.set(key, value)
  }
}

const TANK_ROWS: Record<string, keyof TankGrade> = {
  opening: 'opening',
  purchase: 'purchase',
  closing: 'closing',
  stinches: 'stick',
  stick: 'stick',
  'o s': 'os'
}

type TankColumns = { regular: TankGrade; plus: TankGrade; super: TankGrade; diesel: TankGrade }

const emptyGrade = (): TankGrade => ({ opening: null, purchase: null, closing: null, stick: null, os: null })

function readTank(rows: string[][]): { grades: TankColumns; sold: Record<'regular' | 'plus' | 'super' | 'diesel', number | null> } {
  const grades: TankColumns = { regular: emptyGrade(), plus: emptyGrade(), super: emptyGrade(), diesel: emptyGrade() }
  const sold = { regular: null as number | null, plus: null as number | null, super: null as number | null, diesel: null as number | null }
  let inTank = false
  for (const cells of rows) {
    const joined = normalizeLabel(cells.join(' '))
    if (joined.includes('daily tank report')) inTank = true
    if (!inTank) continue
    const first = cells.findIndex((c) => c !== '')
    if (first < 0) continue
    const label = normalizeLabel(cells[first])
    const values = cells.slice(first + 1).filter((c) => c !== '')
    const nums = values.map(parseMoneyCell)
    if (nums.length < 4 || nums.some((n) => n === null)) continue
    const [regular, plus, superGrade, diesel] = nums as number[]
    if (label === 'sold') {
      sold.regular = regular
      sold.plus = plus
      sold.super = superGrade
      sold.diesel = diesel
      continue
    }
    const field = TANK_ROWS[label]
    if (!field) continue
    grades.regular[field] = regular
    grades.plus[field] = plus
    grades.super[field] = superGrade
    grades.diesel[field] = diesel
  }
  return { grades, sold }
}

function readReportDate(html: string): string | null {
  const text = cleanText(html)
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const REQUIRED: Array<[string, string]> = [
  ['totalSales', 'Total Sales'],
  ['totalCollections', 'Total Collections'],
  ['shortOver', 'Short Over']
]

export function parseCstoreDailyReportHtml(html: string): CstoreParseResult {
  if (!/daily\s+report/i.test(html)) {
    return { ok: false, code: 'not_a_report', message: 'Page does not look like the Cstore Daily Report', missing: [] }
  }
  const rows = htmlRows(html)
  const amounts = readLabelledAmounts(rows)
  fillFromTextStream(html, amounts)
  const missing = REQUIRED.filter(([key]) => !amounts.has(key)).map(([, label]) => label)
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'missing_labels',
      message: `Daily Report is missing: ${missing.join(', ')}`,
      missing
    }
  }

  const get = (key: string) => amounts.get(key) ?? 0

  // The totals were read, so their parts should be too. If every part is zero while the total is not,
  // the page layout was not understood: refuse it rather than save zeros as if they were real.
  const salesParts = get('grocery') + get('regularAmt') + get('plusAmt') + get('superAmt') + get('dieselAmt')
  const collectionParts = get('depositsTyped') + get('fleetBatch') + get('creditDebitBatch') + get('custAccountSales')
  const unread: string[] = []
  if (get('totalSales') > 0.005 && salesParts < 0.005) unread.push('sales lines (Grocery, fuel amounts)')
  if (get('totalCollections') > 0.005 && collectionParts < 0.005) {
    unread.push('collection lines (Deposits, Fleet, Credit card 2, Customer accounts)')
  }
  if (unread.length > 0) {
    return {
      ok: false,
      code: 'missing_labels',
      message: `Daily Report totals were read but not the ${unread.join(' or ')}`,
      missing: unread
    }
  }

  const { grades, sold } = readTank(rows)
  const sum = (...n: Array<number | null>) => n.reduce<number>((t, v) => t + (v ?? 0), 0)

  return {
    ok: true,
    report: {
      date: readReportDate(html),
      grocery: get('grocery'),
      salesTax: get('salesTax'),
      // Plus and Super roll into the unleaded figure, the same as Shift Close does.
      regularAmt: Math.round((get('regularAmt') + get('plusAmt') + get('superAmt')) * 100) / 100,
      dieselAmt: get('dieselAmt'),
      custAccountPayIn: get('custAccountPayIn'),
      totalSales: get('totalSales'),
      depositsTyped: get('depositsTyped'),
      fleetBatch: get('fleetBatch'),
      creditDebitBatch: get('creditDebitBatch'),
      custAccountSales: get('custAccountSales'),
      totalCollections: get('totalCollections'),
      shortOver: get('shortOver'),
      regularLitres: Math.round(sum(sold.regular, sold.plus, sold.super) * 1000) / 1000,
      dieselLitres: sold.diesel ?? 0,
      tank: { regular: grades.regular, diesel: grades.diesel }
    }
  }
}
