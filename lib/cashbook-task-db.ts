import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  CASHBOOK_ACCOUNTS,
  CASHBOOK_OPENING_BALANCES,
  isCashbookAccount,
  otherCashbookAccount,
  type CashbookAccount
} from '@/lib/cashbook-accounts'
import { moveEntriesToAccount } from '@/lib/cashbook-account-db'
import { compareSheet, entryOut, type AppEntry, type CompareResult, type TaskDraft } from '@/lib/cashbook-compare'
import { createCashbookExpenseEntry, getOrCreateExpenseCategory } from '@/lib/cashbook-expense'
import type { ParsedSheet, SheetLine } from '@/lib/cashbook-sheet'
import { createTransfer } from '@/lib/cashbook-transfer'

export class TaskError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'TaskError'
  }
}

const entrySelect = {
  id: true,
  account: true,
  date: true,
  description: true,
  ref: true,
  creditAmt: true,
  debitCash: true,
  debitCheck: true,
  debitEcard: true,
  debitDcard: true,
  shiftIncomeKind: true,
  transferGroupId: true
} as const

function shiftYmd(ymd: string, days: number): string {
  const date = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function loadEntries(periodStart: string, periodEnd: string): Promise<AppEntry[]> {
  return prisma.cashbookEntry.findMany({
    where: { date: { gte: shiftYmd(periodStart, -21), lte: shiftYmd(periodEnd, 21) } },
    select: entrySelect,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  })
}

/** Opening balance the accountant confirmed, plus everything booked to the account since. */
async function appClosingBalance(account: CashbookAccount, periodEnd: string): Promise<number | null> {
  const opening = CASHBOOK_OPENING_BALANCES[account]
  if (periodEnd < opening.date) return null
  const sums = await prisma.cashbookEntry.aggregate({
    where: { account, date: { gte: opening.date, lte: periodEnd } },
    _sum: { creditAmt: true, debitCash: true, debitCheck: true, debitEcard: true, debitDcard: true }
  })
  const s = sums._sum
  const moved =
    (s.creditAmt ?? 0) - ((s.debitCash ?? 0) + (s.debitCheck ?? 0) + (s.debitEcard ?? 0) + (s.debitDcard ?? 0))
  return roundMoney(opening.amount + moved)
}

export type StoredSheet = {
  account: CashbookAccount
  fileName: string
  periodStart: string
  periodEnd: string
  openingBalance: number | null
  closingBalance: number | null
  lines: SheetLine[]
}

export function storedSheetFrom(parsed: ParsedSheet, fileName: string, accountOverride?: CashbookAccount | null): StoredSheet {
  const account = accountOverride ?? parsed.account
  if (!account) throw new TaskError('Could not tell which bank account this sheet is for. Choose the account.')
  if (!parsed.periodEnd || !parsed.periodStart) throw new TaskError('Could not read the period from the sheet heading.')
  if (parsed.lines.length === 0) throw new TaskError(parsed.warnings[0] ?? 'No lines were found in the sheet.')
  return {
    account,
    fileName,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    openingBalance: parsed.openingBalance,
    closingBalance: parsed.closingBalance,
    lines: parsed.lines
  }
}

export async function compareStoredSheet(sheet: StoredSheet, otherLines: SheetLine[] | null): Promise<CompareResult> {
  const [entries, appClosing] = await Promise.all([
    loadEntries(sheet.periodStart, sheet.periodEnd),
    appClosingBalance(sheet.account, sheet.periodEnd)
  ])
  return compareSheet({
    account: sheet.account,
    periodStart: sheet.periodStart,
    periodEnd: sheet.periodEnd,
    openingBalance: sheet.openingBalance,
    closingBalance: sheet.closingBalance,
    lines: sheet.lines,
    otherLines,
    entries,
    appClosing
  })
}

/** What the screen shows before anything is saved. Nothing is written. */
export type CompareSummary = {
  account: CashbookAccount
  fileName: string
  periodStart: string
  periodEnd: string
  counts: CompareResult['counts']
  balances: CompareResult['balances']
  tasks: Array<Pick<TaskDraft, 'fingerprint' | 'kind' | 'title' | 'detail' | 'date' | 'amount' | 'canCreate'>>
}

export function summarize(sheet: StoredSheet, result: CompareResult): CompareSummary {
  return {
    account: sheet.account,
    fileName: sheet.fileName,
    periodStart: sheet.periodStart,
    periodEnd: sheet.periodEnd,
    counts: result.counts,
    balances: result.balances,
    tasks: result.tasks.map(({ fingerprint, kind, title, detail, date, amount, canCreate }) => ({
      fingerprint,
      kind,
      title,
      detail,
      date,
      amount,
      canCreate
    }))
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * Save the tasks for one comparison.
 * Existing tasks are matched by fingerprint: open ones are refreshed, dismissed ones stay dismissed,
 * done ones come back if the sheet still disagrees with the cashbook. Open tasks inside the period that
 * the comparison no longer raises are closed, because the cashbook now matches.
 */
async function applyTasks(
  sheet: StoredSheet,
  result: CompareResult,
  uploadId: string
): Promise<{ created: number; reopened: number; closed: number; kept: number }> {
  const stats = { created: 0, reopened: 0, closed: 0, kept: 0 }
  const fingerprints = result.tasks.map((task) => task.fingerprint)
  const existing = await prisma.cashbookTask.findMany({
    where: {
      OR: [
        { fingerprint: { in: fingerprints } },
        { account: sheet.account, status: 'open', OR: [{ date: null }, { date: { gte: sheet.periodStart, lte: sheet.periodEnd } }] }
      ]
    }
  })
  const byFingerprint = new Map(existing.map((task) => [task.fingerprint, task]))
  const raised = new Set(fingerprints)

  for (const draft of result.tasks) {
    const data = {
      uploadId,
      kind: draft.kind,
      account: draft.account,
      title: draft.title,
      detail: draft.detail,
      date: draft.date,
      amount: draft.amount,
      ref: draft.ref,
      route: draft.route,
      canCreate: draft.canCreate,
      payload: json(draft.payload)
    }
    const found = byFingerprint.get(draft.fingerprint)
    if (!found) {
      await prisma.cashbookTask.create({ data: { ...data, fingerprint: draft.fingerprint } })
      stats.created += 1
    } else if (found.status === 'dismissed') {
      stats.kept += 1
    } else if (found.status === 'done') {
      await prisma.cashbookTask.update({
        where: { id: found.id },
        data: { ...data, status: 'open', resolvedAt: null, resolution: 'Reopened: the latest sheet still disagrees with the cashbook.' }
      })
      stats.reopened += 1
    } else {
      await prisma.cashbookTask.update({ where: { id: found.id }, data })
      stats.kept += 1
    }
  }

  const stale = existing.filter(
    (task) =>
      task.status === 'open' &&
      task.account === sheet.account &&
      !raised.has(task.fingerprint)
  )
  if (stale.length > 0) {
    await prisma.cashbookTask.updateMany({
      where: { id: { in: stale.map((task) => task.id) } },
      data: { status: 'done', resolvedAt: new Date(), resolution: 'Now matches the cashbook.' }
    })
    stats.closed = stale.length
  }
  return stats
}

async function latestSheetFor(account: CashbookAccount, periodEnd?: string) {
  return prisma.cashbookUpload.findFirst({
    where: { account, ...(periodEnd ? { periodEnd } : {}) },
    orderBy: { createdAt: 'desc' }
  })
}

function uploadLines(row: { linesJson: Prisma.JsonValue }): SheetLine[] {
  return Array.isArray(row.linesJson) ? (row.linesJson as unknown as SheetLine[]) : []
}

/** The other account's lines for the same period: from this upload if both came together, else the latest saved. */
async function partnerLines(sheet: StoredSheet, together: StoredSheet[]): Promise<SheetLine[] | null> {
  const other = otherCashbookAccount(sheet.account)
  const partner = together.find((candidate) => candidate.account === other && candidate.periodEnd === sheet.periodEnd)
  if (partner) return partner.lines
  const stored = await latestSheetFor(other, sheet.periodEnd)
  return stored ? uploadLines(stored) : null
}

/** Compare without saving anything. */
export async function previewUploads(sheets: StoredSheet[]): Promise<CompareSummary[]> {
  const out: CompareSummary[] = []
  for (const sheet of sheets) {
    out.push(summarize(sheet, await compareStoredSheet(sheet, await partnerLines(sheet, sheets))))
  }
  return out
}

/** Compare, save the upload and raise the tasks. Sheets uploaded together are used to pair transfers. */
export async function saveUploads(sheets: StoredSheet[]) {
  const results: Array<{ summary: CompareSummary; tasks: Awaited<ReturnType<typeof applyTasks>> }> = []
  for (const sheet of sheets) {
    const result = await compareStoredSheet(sheet, await partnerLines(sheet, sheets))
    const summary = summarize(sheet, result)
    const upload = await prisma.cashbookUpload.create({
      data: {
        account: sheet.account,
        fileName: sheet.fileName,
        periodStart: sheet.periodStart,
        periodEnd: sheet.periodEnd,
        openingBalance: sheet.openingBalance,
        linesJson: json(sheet.lines),
        summaryJson: json({ counts: result.counts, balances: result.balances })
      }
    })
    results.push({ summary, tasks: await applyTasks(sheet, result, upload.id) })
  }
  return results
}

/** Run the comparison again for the newest sheet of each account, against the cashbook as it is now. */
export async function recheckAll() {
  const out: Array<{ account: CashbookAccount; created: number; reopened: number; closed: number; open: number }> = []
  for (const account of CASHBOOK_ACCOUNTS) {
    const upload = await latestSheetFor(account)
    if (!upload || !isCashbookAccount(upload.account)) continue
    const other = otherCashbookAccount(account)
    const partner = await latestSheetFor(other, upload.periodEnd)
    const sheet: StoredSheet = {
      account,
      fileName: upload.fileName,
      periodStart: upload.periodStart,
      periodEnd: upload.periodEnd,
      openingBalance: upload.openingBalance,
      closingBalance: (upload.summaryJson as { balances?: { sheetClosing?: number | null } } | null)?.balances?.sheetClosing ?? null,
      lines: uploadLines(upload)
    }
    const result = await compareStoredSheet(sheet, partner ? uploadLines(partner) : null)
    const stats = await applyTasks(sheet, result, upload.id)
    await prisma.cashbookUpload.update({
      where: { id: upload.id },
      data: { summaryJson: json({ counts: result.counts, balances: result.balances }) }
    })
    out.push({ account, created: stats.created, reopened: stats.reopened, closed: stats.closed, open: result.tasks.length })
  }
  return out
}

export type TaskFilter = { status?: string; account?: string }

export async function listTasks(filter: TaskFilter = {}) {
  const tasks = await prisma.cashbookTask.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.account && isCashbookAccount(filter.account) ? { account: filter.account } : {})
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  })
  const entryIds = [
    ...new Set(
      tasks
        .map((task) => (task.payload as { entryId?: string } | null)?.entryId)
        .filter((id): id is string => Boolean(id))
    )
  ]
  const entries = entryIds.length
    ? await prisma.cashbookEntry.findMany({ where: { id: { in: entryIds } }, select: entrySelect })
    : []
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  return tasks.map((task) => {
    const entryId = (task.payload as { entryId?: string } | null)?.entryId
    const entry = entryId ? entryById.get(entryId) : undefined
    return {
      ...task,
      entry: entry
        ? {
            id: entry.id,
            account: entry.account,
            date: entry.date,
            description: entry.description,
            amount: entry.creditAmt > 0 ? entry.creditAmt : entryOut(entry)
          }
        : null
    }
  })
}

export async function listUploads() {
  const uploads = await prisma.cashbookUpload.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      account: true,
      fileName: true,
      periodStart: true,
      periodEnd: true,
      openingBalance: true,
      summaryJson: true,
      createdAt: true
    }
  })
  return uploads
}

async function getTask(id: string) {
  const task = await prisma.cashbookTask.findUnique({ where: { id } })
  if (!task) throw new TaskError('Task not found', 404)
  return task
}

export async function setTaskStatus(
  id: string,
  status: 'open' | 'done' | 'dismissed',
  resolution: string
) {
  await getTask(id)
  const trimmed = resolution.trim()
  if (status === 'dismissed' && !trimmed) throw new TaskError('Give a reason for dismissing this')
  return prisma.cashbookTask.update({
    where: { id },
    data: {
      status,
      resolution: status === 'open' ? '' : trimmed || 'Done',
      resolvedAt: status === 'open' ? null : new Date()
    }
  })
}

async function bankChargesCategory() {
  const existing = await prisma.cashbookCategory.findFirst({
    where: { name: { equals: 'Bank charges', mode: 'insensitive' }, type: 'expense', active: true }
  })
  return existing ?? getOrCreateExpenseCategory('Bank charges', null)
}

/** The one-click path. Only for things that start at the bank: fees and transfers. */
export async function createFromTask(id: string) {
  const task = await getTask(id)
  if (task.status !== 'open') throw new TaskError('This task is already closed')
  if (!task.canCreate) throw new TaskError('This one has to be entered through its own screen')
  if (!isCashbookAccount(task.account)) throw new TaskError('Unknown account on this task')
  const payload = (task.payload ?? {}) as TaskDraft['payload']

  if (task.kind === 'missing_transfer') {
    const transfer = payload.transfer
    if (!transfer) throw new TaskError('The transfer details are missing')
    const made = await createTransfer({ date: transfer.date, amount: transfer.amount, from: transfer.from, to: transfer.to })
    return setTaskStatus(id, 'done', `Transfer recorded (${made.entryIds.length} lines).`)
  }

  const prefill = payload.prefill
  if (task.kind === 'missing_entry' && prefill && prefill.type === 'expense') {
    const category = await bankChargesCategory()
    await createCashbookExpenseEntry({
      date: prefill.date,
      description: prefill.description,
      amount: prefill.amount,
      categoryId: category.id,
      paymentMethod: prefill.paymentMethod || 'direct_debit',
      ref: '',
      account: task.account,
      accountSource: 'manual'
    })
    return setTaskStatus(id, 'done', 'Entered from the sheet under Bank charges.')
  }
  throw new TaskError('Nothing to create for this task')
}

/** Wrong-account tasks: move the entry to the account the sheet shows. */
export async function moveFromTask(id: string) {
  const task = await getTask(id)
  if (task.status !== 'open') throw new TaskError('This task is already closed')
  const payload = (task.payload ?? {}) as TaskDraft['payload']
  if (task.kind !== 'wrong_account' || !payload.entryId || !payload.toAccount) {
    throw new TaskError('Nothing to move for this task')
  }
  const result = await moveEntriesToAccount([payload.entryId], payload.toAccount)
  if (result.skipped.length > 0) throw new TaskError(result.skipped[0].reason, 409)
  return setTaskStatus(id, 'done', `Moved to ${payload.toAccount === 'westline' ? 'Westline' : 'Service Station'}.`)
}

export async function taskCounts() {
  const rows = await prisma.cashbookTask.groupBy({ by: ['status', 'account'], _count: { _all: true } })
  const counts = { open: 0, done: 0, dismissed: 0, openByAccount: { westline: 0, service_station: 0 } as Record<CashbookAccount, number> }
  for (const row of rows) {
    if (row.status === 'open') {
      counts.open += row._count._all
      if (isCashbookAccount(row.account)) counts.openByAccount[row.account] += row._count._all
    } else if (row.status === 'done') counts.done += row._count._all
    else if (row.status === 'dismissed') counts.dismissed += row._count._all
  }
  return counts
}
