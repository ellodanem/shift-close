import { formatWorkDateLabelLong } from '@/lib/datetime-policy'
import {
  calendarMonthFromYmd,
  compareYmd,
  enumerateWeekKeysFromEpoch,
  monthQueryFromParts,
  weekDueSunday,
  weekKeyMonday,
  weeklySundayTimingStatus
} from '@/lib/operations-checklist-due-dates'
import { sectionForShiftParent, worstShiftStatus } from '@/lib/operations-checklist-shift-close'
import type {
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistSubtask,
  ChecklistSubtaskBucket
} from '@/lib/operations-checklist-types'
import { CHECKLIST_EPOCH_YMD } from '@/lib/operations-checklist-types'

export type CustomerArImportRow = {
  weekKey: string
  year: number
  month: number
  accountCount: number
  accountsWithCharges: number
}

type BuildCustomerAccountsInput = {
  asOf: string
  now?: Date
  importLogs: CustomerArImportRow[]
  completeAcks: ReadonlySet<string>
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

function subtaskBadgeWeight(status: ChecklistItemStatus): 0 | 1 {
  return status === 'due' || status === 'overdue' || status === 'incomplete' ? 1 : 0
}

function importLogForWeek(
  logs: CustomerArImportRow[],
  weekKey: string,
  year: number,
  month: number
): CustomerArImportRow | undefined {
  return logs.find((l) => l.weekKey === weekKey && l.year === year && l.month === month)
}

export type CustomerWeekEval = {
  eligible: boolean
  zeroCharges: boolean
  wrongMonth: boolean
  reason: string
  importLog?: CustomerArImportRow
}

export function evaluateCustomerAccountsWeek(
  weekKey: string,
  importLogs: CustomerArImportRow[]
): CustomerWeekEval {
  const weekSunday = weekDueSunday(weekKey)
  const { year, month } = calendarMonthFromYmd(weekSunday)
  const log = importLogForWeek(importLogs, weekKey, year, month)

  if (!log) {
    return {
      eligible: false,
      zeroCharges: false,
      wrongMonth: false,
      reason: `Upload ${MONTH_NAMES[month - 1]} ${year} CSV`
    }
  }

  if (log.accountsWithCharges < 1) {
    return {
      eligible: false,
      zeroCharges: true,
      wrongMonth: false,
      reason: 'No accounts with charges — verify POS export',
      importLog: log
    }
  }

  return {
    eligible: true,
    zeroCharges: false,
    wrongMonth: false,
    reason: `${log.accountCount} accounts, ${log.accountsWithCharges} with charges`,
    importLog: log
  }
}

export function buildCustomerAccountsSubtask(params: {
  weekKey: string
  bucket: ChecklistSubtaskBucket
  asOf: string
  now?: Date
  importLogs: CustomerArImportRow[]
  completeAcks: ReadonlySet<string>
}): ChecklistSubtask | null {
  const { weekKey, bucket, asOf, now = new Date(), importLogs, completeAcks } = params
  const weekSunday = weekDueSunday(weekKey)
  const { year, month } = calendarMonthFromYmd(weekSunday)

  if (completeAcks.has(weekKey)) return null

  const timing = weeklySundayTimingStatus(asOf, weekSunday, now)
  if (timing === 'not_due') return null

  const evalResult = evaluateCustomerAccountsWeek(weekKey, importLogs)
  let status: ChecklistItemStatus
  if (evalResult.eligible) {
    status = timing
  } else if (evalResult.zeroCharges) {
    status = 'incomplete'
  } else {
    status = timing
  }

  const monthQuery = monthQueryFromParts(year, month)
  const actions: ChecklistSubtask['actions'] = evalResult.eligible
    ? ['mark_complete']
    : evalResult.zeroCharges
      ? ['mark_complete_with_note']
      : undefined

  return {
    id: `customer-accounts:${weekKey}`,
    workDate: weekSunday,
    label: `Week ending ${formatWorkDateLabelLong(weekSunday)}`,
    status,
    reason: evalResult.reason,
    href: `/customer-accounts?month=${monthQuery}`,
    badgeWeight: subtaskBadgeWeight(status),
    bucket,
    dueDate: weekSunday,
    weekKey,
    actions
  }
}

function sortSubtasks(subtasks: ChecklistSubtask[]): ChecklistSubtask[] {
  const statusOrder: Record<ChecklistItemStatus, number> = {
    overdue: 0,
    reopened: 1,
    discrepancy: 2,
    due: 3,
    incomplete: 4,
    in_progress: 5,
    blocked: 6,
    not_due: 7,
    complete: 8,
    na: 9
  }
  return [...subtasks].sort((a, b) => {
    const s = statusOrder[a.status] - statusOrder[b.status]
    if (s !== 0) return s
    return b.workDate.localeCompare(a.workDate)
  })
}

export function buildCustomerAccountsGroup(input: BuildCustomerAccountsInput): ChecklistItem {
  const { asOf, now = new Date(), importLogs, completeAcks } = input
  const currentWeekStart = weekKeyMonday(asOf)
  const weekKeys = enumerateWeekKeysFromEpoch(asOf, CHECKLIST_EPOCH_YMD)

  const subtasks: ChecklistSubtask[] = []
  for (const weekKey of weekKeys) {
    const bucket = compareYmd(weekKey, currentWeekStart) >= 0 ? 'current_week' : 'backlog'
    const sub = buildCustomerAccountsSubtask({
      weekKey,
      bucket,
      asOf,
      now,
      importLogs,
      completeAcks
    })
    if (sub) subtasks.push(sub)
  }

  const sorted = sortSubtasks(subtasks)
  const badge = sorted.reduce((n, s) => n + s.badgeWeight, 0)
  const status = worstShiftStatus(sorted)
  const currentWeekCount = sorted.filter((s) => s.bucket === 'current_week').length
  const backlogCount = sorted.filter((s) => s.bucket === 'backlog').length

  let summary = 'All weeks complete'
  if (sorted.length > 0) {
    const parts: string[] = []
    if (currentWeekCount > 0) parts.push(`${currentWeekCount} this week`)
    if (backlogCount > 0) parts.push(`${backlogCount} in backlog`)
    summary = parts.join(', ')
  }

  return {
    id: 'customer-accounts',
    label: 'Update customer accounts',
    section: sectionForShiftParent(sorted, asOf),
    status: sorted.length === 0 ? 'complete' : status,
    summary,
    href: '/customer-accounts',
    badgeWeight: badge > 0 ? 1 : 0,
    children: sorted
  }
}
