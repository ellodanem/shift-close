import { roundMoney } from '@/lib/fuelPayments'
import {
  CASHBOOK_OPENING_BALANCES,
  cashbookAccountLabel,
  isCashbookAccount,
  otherCashbookAccount,
  type CashbookAccount
} from '@/lib/cashbook-accounts'
import type { SheetLine } from '@/lib/cashbook-sheet'

/** What the cashbook holds, reduced to what the comparison needs. */
export type AppEntry = {
  id: string
  account: string
  date: string
  description: string
  ref: string | null
  creditAmt: number
  debitCash: number
  debitCheck: number
  debitEcard: number
  debitDcard: number
  shiftIncomeKind: string | null
  transferGroupId: string | null
}

export type TaskKind =
  | 'missing_entry'
  | 'missing_transfer'
  | 'wrong_account'
  | 'amount_differs'
  | 'card_day'
  | 'extra_in_app'
  | 'sheet_issue'
  | 'opening_balance'

/** Which normal screen the work belongs in. */
export type TaskRoute =
  | 'cashbook'
  | 'vendor_payment'
  | 'fuel_payment'
  | 'payroll'
  | 'customer_payment'
  | 'shift'
  | 'transfer'
  | 'none'

export type TaskPrefill = {
  type: 'income' | 'expense'
  date: string
  amount: number
  description: string
  ref: string
  paymentMethod: string
  account: CashbookAccount
  categoryHint: string
}

export type TaskDraft = {
  fingerprint: string
  kind: TaskKind
  account: CashbookAccount
  date: string | null
  amount: number | null
  ref: string
  title: string
  detail: string
  route: TaskRoute
  /** Fees, charges and transfers start at the bank, so one click can create them. */
  canCreate: boolean
  payload: {
    line?: SheetLine
    prefill?: TaskPrefill
    entryId?: string
    entryIds?: string[]
    toAccount?: CashbookAccount
    transfer?: { from: CashbookAccount; to: CashbookAccount; date: string; amount: number }
    appAmount?: number
    sheetAmount?: number
    cardKind?: 'credit' | 'debit'
  }
}

export type MatchedLine = { line: SheetLine; entryIds: string[]; dayDifference: number }

export type CompareBalances = {
  sheetOpening: number | null
  appOpening: number
  sheetClosing: number | null
  appClosing: number | null
  difference: number | null
}

export type CompareResult = {
  account: CashbookAccount
  tasks: TaskDraft[]
  matched: MatchedLine[]
  counts: {
    sheetLines: number
    matched: number
    missing: number
    wrongAccount: number
    differs: number
    cardDays: number
    extra: number
    issues: number
  }
  balances: CompareBalances
}

const TOLERANCE = 0.005
const IN_WINDOW_DAYS = 5
const OUT_WINDOW_DAYS = 21

function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE
}

export function entryOut(entry: AppEntry): number {
  return roundMoney(
    (entry.debitCash || 0) + (entry.debitCheck || 0) + (entry.debitEcard || 0) + (entry.debitDcard || 0)
  )
}

function dayNumber(ymd: string): number {
  return Math.floor(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / 86400000)
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(dayNumber(a) - dayNumber(b))
}

function normRef(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/^0+(?=\d)/, '')
}

function normText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function niceDate(ymd: string | null): string {
  if (!ymd) return 'an unreadable date'
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(ymd.slice(8, 10))} ${months[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`
}

export type LineKind =
  | 'card'
  | 'transfer_out'
  | 'customer_eft'
  | 'deposit'
  | 'bank_charge'
  | 'eft'
  | 'cheque'
  | 'no_ref'
  | 'other'

export function classifyLine(line: SheetLine): LineKind {
  if (line.side === 'in') {
    if (line.crCard > 0 || line.drCard > 0) return 'card'
    if (line.negative) return 'transfer_out'
    if (line.label.trim()) return 'customer_eft'
    return 'deposit'
  }
  const ref = line.ref.trim()
  if (/^bank$/i.test(ref)) return 'bank_charge'
  if (/^\d{8}$/.test(ref)) return 'eft'
  if (/^\d{1,7}$/.test(ref)) return 'cheque'
  if (!ref) return 'no_ref'
  return 'other'
}

function routeFor(line: SheetLine, kind: LineKind): TaskRoute {
  if (kind === 'card' || kind === 'deposit') return 'shift'
  if (kind === 'customer_eft') return 'customer_payment'
  if (kind === 'transfer_out') return 'transfer'
  if (kind === 'bank_charge') return 'cashbook'
  const names = line.categories.map((category) => category.name.toLowerCase()).join(' ')
  const text = `${names} ${line.description.toLowerCase()}`
  if (/rec\. gas|rubis/.test(text)) return 'fuel_payment'
  if (/salar|sal clr/.test(text)) return 'payroll'
  if (/rec\. gen/.test(text)) return 'vendor_payment'
  return 'cashbook'
}

function paymentMethodFor(kind: LineKind): string {
  if (kind === 'cheque') return 'check'
  if (kind === 'bank_charge') return 'direct_debit'
  if (kind === 'eft') return 'eft'
  if (kind === 'customer_eft' || kind === 'deposit') return 'deposit'
  return 'cash'
}

function lineWhat(line: SheetLine, kind: LineKind): string {
  if (kind === 'cheque') return `cheque ${line.ref}`
  if (kind === 'eft') return `EFT ${line.ref}`
  if (kind === 'bank_charge') return 'bank charge'
  if (kind === 'customer_eft') return `payment from ${line.label}`
  if (kind === 'deposit') return 'deposit'
  if (kind === 'card') return 'card sales'
  return line.side === 'in' ? 'receipt' : 'payment'
}

function lineName(line: SheetLine): string {
  return line.description || line.label || (line.side === 'in' ? 'Receipt' : 'Payment')
}

function categoryText(line: SheetLine): string {
  return line.categories.map((category) => category.name + (category.code ? ` ${category.code}` : '')).join(', ')
}

type Draft = Omit<TaskDraft, 'fingerprint'> & { base: string }

type TransferInfo = { from: CashbookAccount; to: CashbookAccount; date: string; amount: number; lines: SheetLine[] }

function describeEntry(entry: AppEntry): string {
  const amount = entry.creditAmt > 0 ? entry.creditAmt : entryOut(entry)
  return `${niceDate(entry.date)} · ${entry.description || 'No description'} · ${fmt(amount)}`
}

export function compareSheet(input: {
  account: CashbookAccount
  periodStart: string
  periodEnd: string
  openingBalance: number | null
  closingBalance: number | null
  lines: SheetLine[]
  /** The other account's sheet, when it was uploaded too. Lets us tell a transfer from a deposit. */
  otherLines?: SheetLine[] | null
  /** Entries from both accounts, a little wider than the period. */
  entries: AppEntry[]
  /** The cashbook's own balance for this account at the end of the period. */
  appClosing?: number | null
}): CompareResult {
  const account = input.account
  const other = otherCashbookAccount(account)
  const used = new Set<string>()
  const drafts: Draft[] = []
  const matched: MatchedLine[] = []
  const entryAccount = (entry: AppEntry): CashbookAccount | null =>
    isCashbookAccount(entry.account) ? entry.account : null

  const lines = [...input.lines].sort(
    (a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.row - b.row
  )

  const handled = new Set<string>()

  // 1. Transfers. A bracketed receipt is money leaving this account for the other.
  // A plain unlabelled receipt that mirrors a bracketed one on the other sheet is the arriving end.
  const transfers = new Map<string, TransferInfo>()
  const addTransfer = (from: CashbookAccount, date: string, amount: number, line: SheetLine) => {
    const key = `${from}|${date}|${amount.toFixed(2)}`
    const existing = transfers.get(key)
    if (existing) existing.lines.push(line)
    else transfers.set(key, { from, to: from === account ? other : account, date, amount, lines: [line] })
  }
  for (const line of lines) {
    if (line.side !== 'in' || !line.date) continue
    if (classifyLine(line) === 'transfer_out') addTransfer(account, line.date, line.amount, line)
  }
  const otherOut = (input.otherLines ?? []).filter(
    (line) => line.side === 'in' && line.negative && line.date && !(line.crCard > 0 || line.drCard > 0)
  )
  const otherPool = [...otherOut]
  for (const line of lines) {
    if (line.side !== 'in' || !line.date || handled.has(line.key)) continue
    if (classifyLine(line) !== 'deposit') continue
    const hit = otherPool.findIndex((candidate) => candidate.date === line.date && same(candidate.amount, line.amount))
    if (hit >= 0) {
      otherPool.splice(hit, 1)
      addTransfer(other, line.date as string, line.amount, line)
    }
  }

  const pendingTransfers: Array<{ key: string; transfer: TransferInfo }> = []
  for (const [key, transfer] of transfers) {
    for (const line of transfer.lines) handled.add(line.key)
    // Whole transfer already in the cashbook as a linked pair?
    const groups = new Map<string, AppEntry[]>()
    for (const entry of input.entries) {
      if (!entry.transferGroupId || used.has(entry.id)) continue
      const list = groups.get(entry.transferGroupId) ?? []
      list.push(entry)
      groups.set(entry.transferGroupId, list)
    }
    let found: AppEntry[] | null = null
    for (const group of groups.values()) {
      const out = group.find((entry) => entryAccount(entry) === transfer.from && same(entryOut(entry), transfer.amount))
      const incoming = group.find((entry) => entryAccount(entry) === transfer.to && same(entry.creditAmt, transfer.amount))
      if (out && incoming && daysBetween(out.date, transfer.date) <= 3) {
        found = [out, incoming]
        break
      }
    }
    if (found) {
      for (const entry of found) used.add(entry.id)
      for (const line of transfer.lines) {
        handled.add(line.key)
        if (line.side === 'in') matched.push({ line, entryIds: found.map((entry) => entry.id), dayDifference: daysBetween(found[0].date, transfer.date) })
      }
    } else {
      pendingTransfers.push({ key, transfer })
    }
  }

  // 2. Card sales by day (Service Station). The sheet rows are per day, the cashbook has one entry per shift.
  const cardDays = new Map<string, { credit: number; debit: number; lines: SheetLine[] }>()
  for (const line of lines) {
    if (classifyLine(line) !== 'card' || !line.date) continue
    const day = cardDays.get(line.date) ?? { credit: 0, debit: 0, lines: [] }
    day.credit = roundMoney(day.credit + line.crCard)
    day.debit = roundMoney(day.debit + line.drCard)
    day.lines.push(line)
    cardDays.set(line.date, day)
    handled.add(line.key)
  }
  for (const [date, day] of cardDays) {
    for (const cardKind of ['credit', 'debit'] as const) {
      const sheetAmount = cardKind === 'credit' ? day.credit : day.debit
      const dayEntries = input.entries.filter(
        (entry) =>
          entryAccount(entry) === account &&
          entry.date === date &&
          entry.shiftIncomeKind === cardKind &&
          !used.has(entry.id)
      )
      const appAmount = roundMoney(dayEntries.reduce((sum, entry) => sum + entry.creditAmt, 0))
      for (const entry of dayEntries) used.add(entry.id)
      if (sheetAmount === 0 && appAmount === 0) continue
      if (same(sheetAmount, appAmount)) {
        matched.push({ line: day.lines[0], entryIds: dayEntries.map((entry) => entry.id), dayDifference: 0 })
        continue
      }
      if (sheetAmount === 0) continue // only in the cashbook: nothing on the sheet to compare
      const label = cardKind === 'credit' ? 'Credit card' : 'Debit card'
      drafts.push({
        base: `card|${account}|${date}|${cardKind}`,
        kind: 'card_day',
        account,
        date,
        amount: sheetAmount,
        ref: '',
        title:
          appAmount === 0
            ? `${label} sales for ${niceDate(date)} are not in the cashbook`
            : `${label} sales for ${niceDate(date)} differ`,
        detail:
          appAmount === 0
            ? `The sheet has ${fmt(sheetAmount)}. The cashbook has nothing for that day. Close or sync that day's shifts.`
            : `The sheet has ${fmt(sheetAmount)}, the cashbook has ${fmt(appAmount)} (difference ${fmt(roundMoney(sheetAmount - appAmount))}). Check the shift card totals for that day.`,
        route: 'shift',
        canCreate: false,
        payload: { line: day.lines[0], entryIds: dayEntries.map((entry) => entry.id), appAmount, sheetAmount, cardKind }
      })
    }
  }

  // 3. Everything else, one line at a time.
  type Hit = { entry: AppEntry; sameAccount: boolean; refHit: boolean; days: number }
  const findHit = (line: SheetLine, wantAccount: CashbookAccount): Hit | null => {
    const kind = classifyLine(line)
    const window = line.side === 'in' ? IN_WINDOW_DAYS : OUT_WINDOW_DAYS
    const lineRef = normRef(line.ref)
    const hits: Hit[] = []
    for (const entry of input.entries) {
      if (used.has(entry.id)) continue
      const amount = line.side === 'in' ? entry.creditAmt : entryOut(entry)
      if (!same(amount, line.amount)) continue
      const refHit = Boolean(lineRef) && normRef(entry.ref) === lineRef
      const days = line.date ? daysBetween(entry.date, line.date) : 0
      if (!refHit && days > window) continue
      // A short numeric cheque number is not unique across years; require the dates to be near as well.
      if (refHit && kind === 'cheque' && days > 90) continue
      hits.push({ entry, sameAccount: entryAccount(entry) === wantAccount, refHit, days })
    }
    hits.sort(
      (a, b) =>
        Number(b.refHit) - Number(a.refHit) ||
        Number(b.sameAccount) - Number(a.sameAccount) ||
        a.days - b.days
    )
    return hits[0] ?? null
  }

  const runLine = (line: SheetLine, options?: { transferLeg?: boolean; account?: CashbookAccount }) => {
    const wantAccount = options?.account ?? account
    const kind = classifyLine(line)
    const hit = findHit(line, wantAccount)
    if (hit) {
      used.add(hit.entry.id)
      if (!hit.sameAccount && entryAccount(hit.entry)) {
        drafts.push({
          base: `wrong|${wantAccount}|${line.date}|${line.amount.toFixed(2)}|${normRef(line.ref)}|${normText(lineName(line))}`,
          kind: 'wrong_account',
          account: wantAccount,
          date: line.date,
          amount: line.amount,
          ref: line.ref,
          title: `${lineName(line)} is on the wrong account`,
          detail: `The sheet has ${lineWhat(line, kind)} of ${fmt(line.amount)} on ${niceDate(line.date)} under ${cashbookAccountLabel(wantAccount)}. The cashbook has it under ${cashbookAccountLabel(hit.entry.account)}.`,
          route: 'none',
          canCreate: false,
          payload: { line, entryId: hit.entry.id, toAccount: wantAccount }
        })
      } else {
        matched.push({ line, entryIds: [hit.entry.id], dayDifference: hit.days })
      }
      return true
    }

    // Same reference but a different amount, or the same day and a close amount.
    const lineRef = normRef(line.ref)
    let near: AppEntry | null = null
    if (lineRef && kind !== 'bank_charge') {
      near =
        input.entries.find(
          (entry) =>
            !used.has(entry.id) &&
            entryAccount(entry) === wantAccount &&
            normRef(entry.ref) === lineRef &&
            (line.side === 'in' ? entry.creditAmt > 0 : entryOut(entry) > 0) &&
            (!line.date || daysBetween(entry.date, line.date) <= 90)
        ) ?? null
    }
    if (!near && line.side === 'in' && line.date && (kind === 'deposit' || kind === 'customer_eft')) {
      let best: { entry: AppEntry; gap: number } | null = null
      for (const entry of input.entries) {
        if (used.has(entry.id) || entryAccount(entry) !== wantAccount) continue
        if (entry.date !== line.date || entry.creditAmt <= 0 || entry.shiftIncomeKind) continue
        const gap = Math.abs(entry.creditAmt - line.amount)
        if (gap / line.amount > 0.3) continue
        if (!best || gap < best.gap) best = { entry, gap }
      }
      near = best?.entry ?? null
    }
    if (near) {
      used.add(near.id)
      const appAmount = line.side === 'in' ? near.creditAmt : entryOut(near)
      drafts.push({
        base: `differs|${wantAccount}|${line.date}|${normRef(line.ref)}|${normText(lineName(line))}|${line.amount.toFixed(2)}`,
        kind: 'amount_differs',
        account: wantAccount,
        date: line.date,
        amount: line.amount,
        ref: line.ref,
        title: `${lineName(line)}: amounts differ`,
        detail: `The sheet has ${fmt(line.amount)} on ${niceDate(line.date)}. The cashbook has ${fmt(appAmount)} (${describeEntry(near)}). Difference ${fmt(roundMoney(line.amount - appAmount))}.`,
        route: 'none',
        canCreate: false,
        payload: { line, entryId: near.id, appAmount, sheetAmount: line.amount }
      })
      return true
    }
    return false
  }

  for (const line of lines) {
    if (handled.has(line.key)) continue
    if (!line.date && line.side === 'out') {
      // A payment with no date cannot be matched; the sheet issue task covers it.
      continue
    }
    if (runLine(line)) continue
    const kind = classifyLine(line)
    const negativeOut = kind === 'transfer_out'
    if (negativeOut) continue
    const what = lineWhat(line, kind)
    const name = lineName(line)
    const hintRound =
      line.side === 'in' && kind === 'deposit' && line.amount >= 10000 && line.amount % 5000 === 0 && !input.otherLines
        ? ' This is a round amount: it may be a transfer from the other account. Upload that account\'s sheet too to check.'
        : ''
    const routeValue = routeFor(line, kind)
    drafts.push({
      base: `missing|${account}|${line.side}|${line.date}|${line.amount.toFixed(2)}|${normRef(line.ref)}|${normText(name)}`,
      kind: 'missing_entry',
      account,
      date: line.date,
      amount: line.amount,
      ref: line.ref,
      title:
        line.side === 'in'
          ? kind === 'deposit'
            ? `Deposit of ${fmt(line.amount)} on ${niceDate(line.date)} is not in the cashbook`
            : `${name}: ${fmt(line.amount)} on ${niceDate(line.date)} is not in the cashbook`
          : `Add ${what}: ${name}`,
      detail:
        line.side === 'in'
          ? kind === 'deposit'
            ? `On the ${cashbookAccountLabel(account)} sheet. Deposits come from the shift close, so check the shift is closed and its deposit is entered.${hintRound}`
            : `On the ${cashbookAccountLabel(account)} sheet as "${line.label}". It normally arrives from CStore sync. Check the customer payment was imported.`
          : `${fmt(line.amount)} on ${niceDate(line.date)}${line.ref ? `, ref ${line.ref}` : ''}. Sheet category: ${categoryText(line) || 'none'}. Not in the cashbook.`,
      route: routeValue,
      canCreate: kind === 'bank_charge',
      payload: {
        line,
        prefill: {
          type: line.side === 'in' ? 'income' : 'expense',
          date: line.date as string,
          amount: line.amount,
          description: name,
          ref: line.ref,
          paymentMethod: paymentMethodFor(kind),
          account,
          categoryHint: categoryText(line)
        }
      }
    })
  }

  // Transfers that are not in the cashbook as a linked pair. If one end is there as a plain
  // entry, only the other end is missing; if neither is, one click creates both.
  for (const { transfer } of pendingTransfers) {
    const outLine: SheetLine = {
      key: `transfer-out:${transfer.date}:${transfer.amount}`,
      row: 0,
      side: 'out',
      date: transfer.date,
      rawDate: transfer.date,
      ref: '',
      description: `Transfer to ${cashbookAccountLabel(transfer.to)}`,
      label: '',
      amount: transfer.amount,
      negative: false,
      crCard: 0,
      drCard: 0,
      categories: [],
      warnings: []
    }
    const inLine: SheetLine = { ...outLine, key: `transfer-in:${transfer.date}:${transfer.amount}`, side: 'in', description: `Transfer from ${cashbookAccountLabel(transfer.from)}` }
    const outHit = findHit(outLine, transfer.from)
    if (outHit) used.add(outHit.entry.id)
    const inHit = findHit(inLine, transfer.to)
    if (inHit) used.add(inHit.entry.id)
    for (const line of transfer.lines) {
      handled.add(line.key)
      if (line.side === 'in' && (outHit || inHit)) {
        matched.push({ line, entryIds: [outHit?.entry.id, inHit?.entry.id].filter((id): id is string => Boolean(id)), dayDifference: 0 })
      }
    }
    if (outHit && inHit) continue
    const sample = transfer.lines[0]
    if (!outHit && !inHit) {
      drafts.push({
        base: `transfer|${transfer.from}|${transfer.date}|${transfer.amount.toFixed(2)}`,
        kind: 'missing_transfer',
        account: transfer.from,
        date: transfer.date,
        amount: transfer.amount,
        ref: '',
        title: `Transfer of ${fmt(transfer.amount)} from ${cashbookAccountLabel(transfer.from)} to ${cashbookAccountLabel(transfer.to)} on ${niceDate(transfer.date)}`,
        detail: `Both sheets show this movement. Neither end is in the cashbook. One click records it as a linked transfer.`,
        route: 'transfer',
        canCreate: true,
        payload: { line: sample, transfer: { from: transfer.from, to: transfer.to, date: transfer.date, amount: transfer.amount } }
      })
      continue
    }
    const missingLine = outHit ? inLine : outLine
    const missingAccount = outHit ? transfer.to : transfer.from
    drafts.push({
      base: `transfer-leg|${missingAccount}|${transfer.date}|${transfer.amount.toFixed(2)}`,
      kind: 'missing_entry',
      account: missingAccount,
      date: transfer.date,
      amount: transfer.amount,
      ref: '',
      title: `Transfer ${outHit ? 'in' : 'out'}: ${fmt(transfer.amount)} on ${niceDate(transfer.date)} is only half recorded`,
      detail: `One end of this ${cashbookAccountLabel(transfer.from)} to ${cashbookAccountLabel(transfer.to)} transfer is in the cashbook. The ${cashbookAccountLabel(missingAccount)} end is not.`,
      route: 'cashbook',
      canCreate: false,
      payload: {
        line: missingLine,
        prefill: {
          type: outHit ? 'income' : 'expense',
          date: transfer.date,
          amount: transfer.amount,
          description: missingLine.description,
          ref: '',
          paymentMethod: outHit ? 'deposit' : 'eft',
          account: missingAccount,
          categoryHint: 'Transfer'
        }
      }
    })
  }

  // 4. In the cashbook, not on the sheet.
  for (const entry of input.entries) {
    if (used.has(entry.id) || entryAccount(entry) !== account) continue
    if (entry.date < input.periodStart || entry.date > input.periodEnd) continue
    const inAmount = entry.creditAmt
    const outAmount = entryOut(entry)
    if (inAmount === 0 && outAmount === 0) continue
    drafts.push({
      base: `extra|${account}|${entry.id}`,
      kind: 'extra_in_app',
      account,
      date: entry.date,
      amount: inAmount > 0 ? inAmount : outAmount,
      ref: entry.ref ?? '',
      title: `In the cashbook but not on the sheet: ${entry.description || 'No description'}`,
      detail: `${describeEntry(entry)} is under ${cashbookAccountLabel(account)}. Check whether it belongs on the other account, is a duplicate, or the accountant has not recorded it.`,
      route: 'none',
      canCreate: false,
      payload: { entryId: entry.id }
    })
  }

  // 5. Problems in the sheet itself.
  for (const line of lines) {
    for (const warning of line.warnings) {
      drafts.push({
        base: `sheet|${account}|${line.side}|${line.rawDate}|${line.amount.toFixed(2)}|${normText(lineName(line))}|${warning.slice(0, 24)}`,
        kind: 'sheet_issue',
        account,
        date: line.date,
        amount: line.amount,
        ref: line.ref,
        title: `Sheet row ${line.row}: ${lineName(line)}`,
        detail: `${warning} (${cashbookAccountLabel(account)} sheet, row ${line.row}, ${fmt(line.amount)}). Ask the accountant to fix the sheet.`,
        route: 'none',
        canCreate: false,
        payload: { line }
      })
    }
  }
  const openingInfo = CASHBOOK_OPENING_BALANCES[account]
  if (
    input.openingBalance != null &&
    input.periodStart === openingInfo.date.slice(0, 8) + '01' &&
    !same(input.openingBalance, openingInfo.amount)
  ) {
    drafts.push({
      base: `opening|${account}|${input.periodStart}`,
      kind: 'opening_balance',
      account,
      date: input.periodStart,
      amount: input.openingBalance,
      ref: '',
      title: `${cashbookAccountLabel(account)} opening balance differs`,
      detail: `The sheet brings forward ${fmt(input.openingBalance)}. The app was set up with ${fmt(openingInfo.amount)}.`,
      route: 'none',
      canCreate: false,
      payload: { sheetAmount: input.openingBalance, appAmount: openingInfo.amount }
    })
  }

  // Fingerprints must be unique and stable. Identical lines get a counter.
  const seen = new Map<string, number>()
  const tasks: TaskDraft[] = drafts.map(({ base, ...rest }) => {
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return { ...rest, fingerprint: count === 1 ? base : `${base}#${count}` }
  })

  const appClosing = input.appClosing ?? null
  const appOpening = CASHBOOK_OPENING_BALANCES[account].amount
  const count = (kind: TaskKind) => tasks.filter((task) => task.kind === kind).length
  return {
    account,
    tasks,
    matched,
    counts: {
      sheetLines: input.lines.length,
      matched: matched.length,
      missing: count('missing_entry') + count('missing_transfer'),
      wrongAccount: count('wrong_account'),
      differs: count('amount_differs'),
      cardDays: count('card_day'),
      extra: count('extra_in_app'),
      issues: count('sheet_issue') + count('opening_balance')
    },
    balances: {
      sheetOpening: input.openingBalance,
      appOpening,
      sheetClosing: input.closingBalance,
      appClosing,
      difference:
        input.closingBalance != null && appClosing != null ? roundMoney(input.closingBalance - appClosing) : null
    }
  }
}
