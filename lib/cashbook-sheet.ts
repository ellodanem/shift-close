import { roundMoney } from '@/lib/fuelPayments'
import type { CashbookAccount } from '@/lib/cashbook-accounts'

/**
 * Reads the accountant's cash book spreadsheet (Westline or Service Station).
 *
 * Layout, one sheet row per line:
 *   left side  (receipts): DATE, source label, Cr Card, Dr Card, AMT
 *   right side (payments): DATE, CHQ#/ref, description, AMT, then category columns
 * Two header rows sit above the data and the first data row is "B/F" (brought forward).
 * Everything after the last dated line (totals, "zz" marker) is ignored.
 */

export type SheetCategoryAmount = { name: string; code: string; amount: number }

export type SheetLine = {
  /** Stable within one parse: side + sheet row. */
  key: string
  /** 1-based row in the sheet. */
  row: number
  side: 'in' | 'out'
  /** YYYY-MM-DD used for matching. Null when the date could not be read. */
  date: string | null
  rawDate: string
  ref: string
  description: string
  /** Left side source label such as RUBIS or CPJ. */
  label: string
  /** Always positive. A bracketed receipt amount sets `negative`. */
  amount: number
  negative: boolean
  crCard: number
  drCard: number
  categories: SheetCategoryAmount[]
  warnings: string[]
}

export type ParsedSheet = {
  account: CashbookAccount | null
  title: string
  periodEnd: string | null
  periodStart: string | null
  openingBalance: number | null
  /** Opening balance plus receipts minus payments, as the sheet itself foots. */
  closingBalance: number | null
  lines: SheetLine[]
  warnings: string[]
}

export function parseSheetNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  let text = value.trim()
  if (!text) return null
  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  text = text.replace(/[,\s$]/g, '')
  if (text.startsWith('-')) {
    negative = !negative
    text = text.slice(1)
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(text)) return null
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return null
  return negative ? -parsed : parsed
}

function ymd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** dd.mm.yy, dd.mm.yyyy, dd/mm/yy or dd-mm-yy. Returns null when it is not a real date. */
export function parseSheetDate(raw: string): string | null {
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(raw.trim())
  if (!match) return null
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
  return ymd(year, Number(match[2]), Number(match[1]))
}

/**
 * A typo such as 02.10.206 or 20.26.26. Suggests a date only when it is clear: drop a stray
 * digit from the year, or take the period's month when the month is impossible. The caller
 * checks the result sits between the neighbouring rows.
 */
export function suggestSheetDate(raw: string, period: { year: number; month: number } | null): string | null {
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(raw.trim())
  if (!match || !period) return null
  const day = Number(match[1])
  let month = Number(match[2])
  let yearText = match[3]
  const yy = String(period.year).slice(-2)
  if (yearText.length === 3) {
    const options = [0, 1, 2]
      .map((skip) => yearText.slice(0, skip) + yearText.slice(skip + 1))
      .filter((candidate) => candidate === yy)
    if (options.length === 0) return null
    yearText = options[0]
  }
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)
  if (year !== period.year) return null
  if (month < 1 || month > 12) month = period.month
  return ymd(year, month, day)
}

function cell(row: unknown[], index: number): string {
  const value = row[index]
  if (value == null) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function money(row: unknown[], index: number): number | null {
  return parseSheetNumber(row[index])
}

function detectAccount(headerText: string): CashbookAccount | null {
  const text = headerText.toLowerCase()
  if (text.includes('200000316928') || text.includes('westline')) return 'westline'
  if (text.includes('200000102146') || text.includes('service station') || text.includes('total auto inc')) {
    return 'service_station'
  }
  return null
}

function parsePeriodEnd(headerText: string): string | null {
  const match = /period ended\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i.exec(headerText)
  if (!match) return null
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const index = months.indexOf(match[1].toLowerCase())
  if (index < 0) return null
  return ymd(Number(match[3]), index + 1, Number(match[2]))
}

type CategoryColumn = { index: number; name: string; code: string }

function categoryColumns(top: unknown[], bottom: unknown[]): CategoryColumn[] {
  const columns: CategoryColumn[] = []
  const width = Math.max(top.length, bottom.length)
  for (let index = 9; index < width; index += 1) {
    const upper = cell(top, index)
    const lower = cell(bottom, index)
    if (!upper && !lower) continue
    const lowerIsCode = /^\d[\d.]*$/.test(lower)
    const name = lowerIsCode || !lower ? upper : `${upper} ${lower}`.trim()
    columns.push({ index, name: name || lower, code: lowerIsCode ? lower : '' })
  }
  return columns
}

type RawLine = SheetLine & { dateFailed: boolean }

/** Fixes unreadable dates when the guess sits between the rows around it. */
function repairDates(lines: RawLine[], period: { year: number; month: number } | null) {
  for (const side of ['in', 'out'] as const) {
    const sameSide = lines.filter((line) => line.side === side)
    sameSide.forEach((line, position) => {
      if (!line.dateFailed || !line.rawDate) return
      const suggestion = suggestSheetDate(line.rawDate, period)
      const before = sameSide.slice(0, position).reverse().find((other) => other.date)?.date ?? null
      const after = sameSide.slice(position + 1).find((other) => other.date)?.date ?? null
      const fits = suggestion && (!before || suggestion >= before) && (!after || suggestion <= after)
      if (suggestion && fits) {
        line.date = suggestion
        line.warnings.push(`Date "${line.rawDate}" is not a real date. Read as ${suggestion}. Check it on the sheet.`)
      } else {
        line.warnings.push(`Date "${line.rawDate}" is not a real date and could not be guessed.`)
      }
    })
  }
}

export function parseCashbookSheet(rows: unknown[][]): ParsedSheet {
  const warnings: string[] = []
  const headerText = rows
    .slice(0, 6)
    .flat()
    .map((value) => (value == null ? '' : String(value)))
    .join(' ')
  const account = detectAccount(headerText)
  const periodEnd = parsePeriodEnd(headerText)
  const periodParts = periodEnd ? { year: Number(periodEnd.slice(0, 4)), month: Number(periodEnd.slice(5, 7)) } : null
  const periodStart = periodEnd ? `${periodEnd.slice(0, 8)}01` : null

  const headerIndex = rows.findIndex((row) => cell(row, 0).toUpperCase() === 'DATE' && cell(row, 4).toUpperCase() === 'AMT')
  if (headerIndex < 1) {
    return {
      account,
      title: cell(rows[0] ?? [], 4),
      periodEnd,
      periodStart,
      openingBalance: null,
      closingBalance: null,
      lines: [],
      warnings: ['This does not look like a cash book sheet. The DATE / AMT header row was not found.']
    }
  }
  const columns = categoryColumns(rows[headerIndex - 1] ?? [], rows[headerIndex] ?? [])

  let openingBalance: number | null = null
  const lines: RawLine[] = []

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    const rowNumber = index + 1

    const leftDate = cell(row, 0)
    if (leftDate.toUpperCase() === 'B/F') {
      openingBalance = money(row, 4)
    } else if (leftDate) {
      const crCard = money(row, 2) ?? 0
      const drCard = money(row, 3) ?? 0
      const amount = money(row, 4)
      if (amount != null || crCard > 0 || drCard > 0) {
        const date = parseSheetDate(leftDate)
        const line: RawLine = {
          key: `in:${rowNumber}`,
          row: rowNumber,
          side: 'in',
          date,
          rawDate: leftDate,
          ref: '',
          description: '',
          label: cell(row, 1),
          amount: roundMoney(Math.abs(amount ?? 0)),
          negative: (amount ?? 0) < 0,
          crCard: roundMoney(crCard),
          drCard: roundMoney(drCard),
          categories: [],
          warnings: [],
          dateFailed: date == null
        }
        lines.push(line)
      }
    }

    const rightDate = cell(row, 5)
    const ref = cell(row, 6)
    const description = cell(row, 7)
    const paid = money(row, 8)
    const hasText = Boolean(rightDate || ref || description)
    if (rightDate.toLowerCase() !== 'zz' && hasText && paid != null && paid !== 0) {
      const date = rightDate ? parseSheetDate(rightDate) : null
      const categories: SheetCategoryAmount[] = []
      for (const column of columns) {
        const amount = money(row, column.index)
        if (amount != null && amount !== 0) {
          categories.push({ name: column.name, code: column.code, amount: roundMoney(amount) })
        }
      }
      const line: RawLine = {
        key: `out:${rowNumber}`,
        row: rowNumber,
        side: 'out',
        date,
        rawDate: rightDate,
        ref,
        description,
        label: '',
        amount: roundMoney(Math.abs(paid)),
        negative: paid < 0,
        crCard: 0,
        drCard: 0,
        categories,
        warnings: [],
        dateFailed: date == null
      }
      if (!rightDate) line.warnings.push('No date on this line.')
      if (!ref) line.warnings.push('No reference number on this line.')
      lines.push(line)
    }
  }

  repairDates(lines, periodParts)

  const receipts = lines
    .filter((line) => line.side === 'in')
    .reduce((sum, line) => sum + (line.negative ? -line.amount : line.amount), 0)
  const payments = lines
    .filter((line) => line.side === 'out')
    .reduce((sum, line) => sum + (line.negative ? -line.amount : line.amount), 0)
  const closingBalance = openingBalance == null ? null : roundMoney(openingBalance + receipts - payments)

  if (!account) warnings.push('Could not tell which bank account this sheet is for.')
  if (!periodEnd) warnings.push('Could not read the period end date from the sheet heading.')
  if (openingBalance == null) warnings.push('No B/F opening balance found.')

  return {
    account,
    title: cell(rows[0] ?? [], 4),
    periodEnd,
    periodStart,
    openingBalance: openingBalance == null ? null : roundMoney(openingBalance),
    closingBalance,
    lines: lines.map(({ dateFailed: _dateFailed, ...line }) => line),
    warnings
  }
}
