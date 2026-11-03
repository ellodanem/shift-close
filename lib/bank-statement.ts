import { roundMoney } from '@/lib/fuelPayments'

/**
 * Bank statement text -> transactions, plus the rules that spot cashed checks and POS commissions.
 * Pure functions only (no database), so they can be tested without a statement PDF.
 */

export type StatementDirection = 'debit' | 'credit' | 'unknown'

export type StatementTransaction = {
  /** YYYY-MM-DD */
  date: string
  description: string
  amount: number
  balance: number | null
  direction: StatementDirection
}

export type ParsedStatement = {
  transactions: StatementTransaction[]
  periodStart: string | null
  periodEnd: string | null
  skippedLines: number
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
}

const MONEY = /^\(?-?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?(?:DR|CR)?$|^\(?-?\d+\.\d{2}\)?-?(?:DR|CR)?$/i

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null
  const last = new Date(y, m, 0).getDate()
  if (d > last) return null
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y
}

type DateMatch = { ymd: string | null; length: number; needsYear: { month: number; day: number } | null }

/** Reads a date at the very start of `text`. */
export function readLeadingDate(text: string): DateMatch | null {
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?=\s|$)/.exec(text)
  if (m) {
    return { ymd: validYmd(+m[1], +m[2], +m[3]), length: m[0].length, needsYear: null }
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?=\s|$)/.exec(text)
  if (m) {
    // Day first (St Lucia / UK style).
    return { ymd: validYmd(expandYear(+m[3]), +m[2], +m[1]), length: m[0].length, needsYear: null }
  }
  m = /^(\d{1,2})[\s/.-]*([A-Za-z]{3,4})[a-z]*[\s,/.-]*(\d{2,4})(?=\s|$)/.exec(text)
  if (m && MONTHS[m[2].toLowerCase()]) {
    return {
      ymd: validYmd(expandYear(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]),
      length: m[0].length,
      needsYear: null
    }
  }
  m = /^(\d{1,2})[\s/.-]*([A-Za-z]{3,4})(?=\s|$)/.exec(text)
  if (m && MONTHS[m[2].toLowerCase()]) {
    return { ymd: null, length: m[0].length, needsYear: { month: MONTHS[m[2].toLowerCase()], day: +m[1] } }
  }
  m = /^(\d{1,2})[/.-](\d{1,2})(?=\s)/.exec(text)
  if (m && +m[2] <= 12 && +m[1] <= 31) {
    return { ymd: null, length: m[0].length, needsYear: { month: +m[2], day: +m[1] } }
  }
  return null
}

export function parseMoneyToken(token: string): { value: number; negative: boolean; credit: boolean; debit: boolean } | null {
  const t = token.trim()
  if (!MONEY.test(t)) return null
  const upper = t.toUpperCase()
  const credit = upper.endsWith('CR')
  const debit = upper.endsWith('DR')
  const negative = t.includes('(') || t.startsWith('-') || /\.\d{2}-/.test(t)
  const digits = t.replace(/[^0-9.]/g, '')
  const value = Number(digits)
  if (!Number.isFinite(value)) return null
  return { value: roundMoney(value), negative, credit, debit }
}

function signedBalance(token: string): number | null {
  const parsed = parseMoneyToken(token)
  if (!parsed) return null
  const neg = parsed.negative || parsed.debit
  return roundMoney(neg ? -parsed.value : parsed.value)
}

/** Year to use for lines that print only a day and month. */
function detectYear(text: string): number {
  const counts = new Map<number, number>()
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) {
    const y = Number(m[1])
    counts.set(y, (counts.get(y) ?? 0) + 1)
  }
  let best = new Date().getFullYear()
  let bestCount = 0
  for (const [year, count] of counts) {
    if (count > bestCount) {
      best = year
      bestCount = count
    }
  }
  return best
}

function detectPeriod(text: string): { start: string | null; end: string | null } {
  const range =
    /(?:period|from)[^\n]{0,20}?(\d{1,2}[\s/.-]*[A-Za-z]{3,9}[\s/.-]*\d{2,4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s*(?:to|-|–|through|thru)\s*(\d{1,2}[\s/.-]*[A-Za-z]{3,9}[\s/.-]*\d{2,4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i.exec(
      text
    )
  if (!range) return { start: null, end: null }
  const a = readLeadingDate(range[1].trim() + ' ')
  const b = readLeadingDate(range[2].trim() + ' ')
  return { start: a?.ymd ?? null, end: b?.ymd ?? null }
}

/** Splits a row into description + trailing amounts. Returns null when it has no amount. */
function splitAmounts(rest: string): { description: string; money: string[] } | null {
  const tokens = rest.trim().split(/\s+/)
  const money: string[] = []
  while (tokens.length > 1 && money.length < 3) {
    const last = tokens[tokens.length - 1]
    // "123.45 DR" with a space before the suffix.
    if (/^(DR|CR)$/i.test(last) && tokens.length > 2 && MONEY.test(tokens[tokens.length - 2])) {
      tokens.pop()
      money.unshift(`${tokens.pop()}${last}`)
      continue
    }
    if (MONEY.test(last)) {
      money.unshift(tokens.pop() as string)
      continue
    }
    break
  }
  if (money.length === 0) return null
  return { description: tokens.join(' ').trim(), money }
}

const OPENING_BALANCE = /(opening|brought forward|b\/f|previous|balance forward)[^\d\n-]*balance|balance\s*(b\/f|brought forward|forward)/i

export function parseStatementText(text: string): ParsedStatement {
  const year = detectYear(text)
  const period = detectPeriod(text)
  const transactions: StatementTransaction[] = []
  let skipped = 0
  let previousBalance: number | null = null
  /** A dated row whose amounts are printed on a following line. */
  let pending: { date: string; description: string } | null = null

  const push = (date: string, description: string, money: string[]) => {
    const amountToken = money.length >= 2 ? money[money.length - 2] : money[0]
    const amountParsed = parseMoneyToken(amountToken)
    if (!amountParsed) {
      skipped += 1
      return
    }
    const balance = money.length >= 2 ? signedBalance(money[money.length - 1]) : null
    const amount = amountParsed.value

    let direction: StatementDirection = 'unknown'
    if (balance != null && previousBalance != null) {
      if (Math.abs(roundMoney(previousBalance - amount) - balance) <= 0.01) direction = 'debit'
      else if (Math.abs(roundMoney(previousBalance + amount) - balance) <= 0.01) direction = 'credit'
    }
    if (direction === 'unknown') {
      if (amountParsed.credit) direction = 'credit'
      else if (amountParsed.debit || amountParsed.negative) direction = 'debit'
    }
    if (balance != null) previousBalance = balance

    transactions.push({ date, description, amount, balance, direction })
  }

  const lastMoney = (money: string[]) => signedBalance(money[money.length - 1])

  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)

  for (const line of lines) {
    const dated = readLeadingDate(line)
    if (!dated) {
      if (OPENING_BALANCE.test(line)) {
        const split = splitAmounts(line)
        if (split) previousBalance = lastMoney(split.money)
        pending = null
        continue
      }
      if (/page \d|statement|balance|total/i.test(line)) continue

      const split = splitAmounts(line)
      if (pending) {
        if (split) {
          push(pending.date, `${pending.description} ${split.description}`.trim(), split.money)
          pending = null
        } else {
          pending.description = `${pending.description} ${line}`.trim()
        }
        continue
      }
      // Continuation of the previous transaction's description (e.g. the check number).
      const last = transactions[transactions.length - 1]
      if (last && !split) last.description = `${last.description} ${line}`.trim()
      continue
    }

    if (pending) {
      skipped += 1
      pending = null
    }

    let ymd = dated.ymd
    if (!ymd && dated.needsYear) {
      ymd = validYmd(year, dated.needsYear.month, dated.needsYear.day)
      // Statement spanning a year-end: January rows belong to the next year.
      if (ymd && period.start && ymd < period.start && period.end && period.end.slice(0, 4) > period.start.slice(0, 4)) {
        ymd = validYmd(year + 1, dated.needsYear.month, dated.needsYear.day)
      }
    }
    if (!ymd) {
      skipped += 1
      continue
    }

    let rest = line.slice(dated.length).trim()
    // Optional value date straight after the posting date.
    const second = readLeadingDate(rest)
    if (second && (second.ymd || second.needsYear)) rest = rest.slice(second.length).trim()

    const split = splitAmounts(rest)
    if (!split) {
      if (rest) pending = { date: ymd, description: rest }
      else skipped += 1
      continue
    }
    if (OPENING_BALANCE.test(split.description)) {
      previousBalance = lastMoney(split.money)
      continue
    }
    if (!split.description) {
      skipped += 1
      continue
    }
    push(ymd, split.description, split.money)
  }

  return { transactions, periodStart: period.start, periodEnd: period.end, skippedLines: skipped }
}
// ---------- Check detection ----------

export type StatementCheck = {
  date: string
  description: string
  amount: number
  /** Digit runs that could be the check number, leading zeros removed. */
  numbers: string[]
}

const CHECK_WORDS = /\b(cheque|check|chq|chk|cheq)\b/i
const NOT_A_PAID_CHECK =
  /\b(deposit|dep|returned|return|unpaid|stop|stopped|book|books|fee|fees|charge|charges|commission|reversal|reversed|certified)\b/i

export function normalizeCheckNumber(value: string): string {
  return value.replace(/^0+(?=\d)/, '')
}

export function digitRuns(value: string): string[] {
  return [...value.matchAll(/\d{2,}/g)].map((m) => normalizeCheckNumber(m[0]))
}

export function findStatementChecks(transactions: StatementTransaction[]): StatementCheck[] {
  const out: StatementCheck[] = []
  for (const tx of transactions) {
    if (tx.direction === 'credit') continue
    if (!CHECK_WORDS.test(tx.description)) continue
    if (NOT_A_PAID_CHECK.test(tx.description.replace(CHECK_WORDS, ''))) continue
    const numbers = digitRuns(tx.description).filter((n) => n.length >= 2 && n.length <= 10)
    if (numbers.length === 0) continue
    out.push({ date: tx.date, description: tx.description, amount: tx.amount, numbers })
  }
  return out
}

// ---------- POS commission detection ----------

export type StatementCommission = {
  date: string
  description: string
  amount: number
  /** The reference printed after "POS- COMMISSION -". */
  reference: string
}

const POS_COMMISSION = /POS\s*-?\s*COMMISSION\s*-?\s*([A-Za-z0-9]*)/i

export function findPosCommissions(transactions: StatementTransaction[]): StatementCommission[] {
  const out: StatementCommission[] = []
  for (const tx of transactions) {
    if (tx.direction === 'credit') continue
    const m = POS_COMMISSION.exec(tx.description)
    if (!m) continue
    const reference = m[1] || ''
    out.push({
      date: tx.date,
      description: reference ? `POS COMMISSION - ${reference}` : 'POS COMMISSION',
      amount: tx.amount,
      reference
    })
  }
  return out
}

// ---------- Matching statement checks to uncashed checks ----------

export type UncashedCandidate = {
  id: string
  payee: string
  bankRef: string
  totalAmount: number
  paymentDate: string
  source: 'vendor' | 'cashbook'
}

export type CheckMatchStatus = 'matched' | 'ambiguous' | 'amount_mismatch' | 'already_cleared' | 'not_found'

export type CheckMatch = {
  check: StatementCheck
  status: CheckMatchStatus
  candidates: UncashedCandidate[]
  /** Set when the check number was found already cleared. */
  note: string | null
}

export function matchStatementChecks(
  checks: StatementCheck[],
  uncashed: UncashedCandidate[],
  cleared: Array<{ bankRef: string; totalAmount: number }>
): CheckMatch[] {
  const refRuns = (ref: string) => new Set(digitRuns(ref))
  const uncashedRuns = uncashed.map((u) => ({ item: u, runs: refRuns(u.bankRef) }))
  const clearedRuns = cleared.map((c) => ({ item: c, runs: refRuns(c.bankRef) }))
  const taken = new Set<string>()

  return checks.map((check) => {
    const sameNumber = uncashedRuns.filter((u) => check.numbers.some((n) => u.runs.has(n)))
    const exact = sameNumber.filter(
      (u) => Math.abs(roundMoney(u.item.totalAmount) - roundMoney(check.amount)) <= 0.01
    )
    const free = exact.filter((u) => !taken.has(u.item.id))

    if (free.length === 1) {
      taken.add(free[0].item.id)
      return { check, status: 'matched' as const, candidates: [free[0].item], note: null }
    }
    if (free.length > 1) {
      return { check, status: 'ambiguous' as const, candidates: free.map((u) => u.item), note: null }
    }
    if (sameNumber.length > 0 && exact.length === 0) {
      return {
        check,
        status: 'amount_mismatch' as const,
        candidates: sameNumber.map((u) => u.item),
        note: 'Check number found in Shift Close, but the amount is different.'
      }
    }
    const alreadyCleared = clearedRuns.some(
      (c) =>
        check.numbers.some((n) => c.runs.has(n)) &&
        Math.abs(roundMoney(c.item.totalAmount) - roundMoney(check.amount)) <= 0.01
    )
    if (alreadyCleared || exact.length > 0) {
      return {
        check,
        status: 'already_cleared' as const,
        candidates: [],
        note: 'Already marked as cashed in Shift Close.'
      }
    }
    return {
      check,
      status: 'not_found' as const,
      candidates: [],
      note: 'No matching uncashed check in Shift Close.'
    }
  })
}

// ---------- Commission duplicate detection ----------

export type ExistingCashbookLine = {
  date: string
  description: string
  amount: number
}

export function isCommissionAlreadyBooked(
  commission: StatementCommission,
  existing: ExistingCashbookLine[]
): boolean {
  return existing.some((line) => {
    if (line.date !== commission.date) return false
    if (Math.abs(roundMoney(line.amount) - roundMoney(commission.amount)) > 0.01) return false
    if (!/pos/i.test(line.description) || !/commission/i.test(line.description)) return false
    if (!commission.reference) return true
    return line.description.toUpperCase().includes(commission.reference.toUpperCase())
  })
}

/** Rebuilds transactions from a request body, dropping anything malformed. */
export function coerceTransactions(value: unknown): StatementTransaction[] {
  if (!Array.isArray(value)) return []
  const out: StatementTransaction[] = []
  for (const raw of value) {
    const t = raw as Partial<StatementTransaction> | null
    if (
      !t ||
      typeof t.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
      typeof t.description !== 'string' ||
      typeof t.amount !== 'number' ||
      !Number.isFinite(t.amount)
    ) {
      continue
    }
    out.push({
      date: t.date,
      description: t.description,
      amount: roundMoney(t.amount),
      balance: typeof t.balance === 'number' && Number.isFinite(t.balance) ? t.balance : null,
      direction: t.direction === 'debit' || t.direction === 'credit' ? t.direction : 'unknown'
    })
  }
  return out
}