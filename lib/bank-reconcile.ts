import { roundMoney } from '@/lib/fuelPayments'

export type RegisterSource = {
  id: string
  date: string
  description: string
  ref: string | null
  creditAmt: number
  debitCash: number
  debitCheck: number
  debitEcard: number
  debitDcard: number
  /** The bank account the entry belongs to. */
  account: string
}

export type ReconcileLine = {
  cashbookEntryId: string
  date: string
  description: string
  ref: string
  deposit: number
  withdrawal: number
  cleared: boolean
}

export type ReconcileBalances = {
  bookBalance: number
  clearedBalance: number
  difference: number
  balanced: boolean
}

export type ReconcileSessionView = {
  id: string
  statementEndDate: string
  statementEndBalance: number
  openingBalance: number
  bookBalance: number
  clearedBalance: number
  difference: number
  balanced: boolean
  lines: ReconcileLine[]
}

export type ReconcileView = {
  session: ReconcileSessionView | null
  /** Last finished statement balance. Null until the first reconciliation is finished. */
  openingBalance: number | null
  /** After a reconciliation is finished, the next opening balance is that statement. */
  openingLocked: boolean
  lastStatementEndDate: string | null
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isYmdDate(value: string): boolean {
  return YMD.test(value)
}

export function registerMovement(entry: {
  creditAmt: number
  debitCash: number
  debitCheck: number
  debitEcard: number
  debitDcard: number
}): { deposit: number; withdrawal: number } {
  return {
    deposit: roundMoney(entry.creditAmt || 0),
    withdrawal: roundMoney(
      (entry.debitCash || 0) + (entry.debitCheck || 0) + (entry.debitEcard || 0) + (entry.debitDcard || 0)
    )
  }
}

/** One account's register: only entries that belong to that account. */
export function listRegisterLines(input: {
  entries: RegisterSource[]
  account: string
  statementEndDate: string
  lockedIds: ReadonlySet<string>
  clearedIds: ReadonlySet<string>
}): ReconcileLine[] {
  const lines: ReconcileLine[] = []
  for (const entry of input.entries) {
    if (!isYmdDate(entry.date) || entry.date > input.statementEndDate) continue
    if (input.lockedIds.has(entry.id)) continue
    if (entry.account !== input.account) continue
    const movement = registerMovement(entry)
    if (movement.deposit === 0 && movement.withdrawal === 0) continue
    lines.push({
      cashbookEntryId: entry.id,
      date: entry.date,
      description: entry.description,
      ref: entry.ref?.trim() || '',
      deposit: movement.deposit,
      withdrawal: movement.withdrawal,
      cleared: input.clearedIds.has(entry.id)
    })
  }
  lines.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.description.localeCompare(b.description) ||
      a.cashbookEntryId.localeCompare(b.cashbookEntryId)
  )
  return lines
}

/** Statement end balance minus the cleared balance. Zero means the ticked lines agree with the statement. */
export function reconcileBalances(input: {
  openingBalance: number
  statementEndBalance: number
  lines: Array<{ deposit: number; withdrawal: number; cleared: boolean }>
}): ReconcileBalances {
  let movement = 0
  let clearedMovement = 0
  for (const line of input.lines) {
    const net = roundMoney(line.deposit - line.withdrawal)
    movement = roundMoney(movement + net)
    if (line.cleared) clearedMovement = roundMoney(clearedMovement + net)
  }
  const bookBalance = roundMoney(input.openingBalance + movement)
  const clearedBalance = roundMoney(input.openingBalance + clearedMovement)
  const difference = roundMoney(input.statementEndBalance - clearedBalance)
  return {
    bookBalance,
    clearedBalance,
    difference,
    balanced: Math.abs(difference) < 0.005
  }
}

/** Discrepancy stays a discrepancy. Every other deposit or card row becomes cleared. */
export function depositBankStatusOnFinish(current: string | null | undefined): 'cleared' | null {
  if (current === 'discrepancy') return null
  return 'cleared'
}

/** The combined card row clears only when every card line for that shift is ticked or already locked. */
export function allCardsCleared(lines: Array<{ cleared: boolean }>): boolean {
  return lines.length > 0 && lines.every((line) => line.cleared)
}
