import type { DayReport } from '@/lib/types'
import type { ComparisonRow } from '@/lib/deposit-comparison-rows'
import { addCalendarDaysYmd } from '@/lib/datetime-policy'
import {
  compareYmd,
  depositComparisonDueDate,
  enumerateYmdRange,
  weekDueSunday,
  weekKeyMonday
} from '@/lib/operations-checklist-due-dates'
import {
  buildShiftCloseSubtask,
  evaluateShiftClose,
  sectionForShiftParent,
  worstShiftStatus
} from '@/lib/operations-checklist-shift-close'
import type {
  ChecklistAckKind,
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistSubtask,
  OperationsChecklistPayload
} from '@/lib/operations-checklist-types'
import {
  buildCustomerAccountsGroup,
  type CustomerArImportRow
} from '@/lib/operations-checklist-customer-accounts'
import { CHECKLIST_EPOCH_YMD, CHECKLIST_ENABLE_DEPOSIT_COMPARISON, CHECKLIST_ENABLE_CUSTOMER_ACCOUNTS, CHECKLIST_ENABLE_VENDOR_INVOICES } from '@/lib/operations-checklist-types'

export { CHECKLIST_EPOCH_YMD } from '@/lib/operations-checklist-types'

type AckRow = {
  taskId: string
  weekKey: string
  kind: string
  note: string | null
}

type BuildInput = {
  asOf: string
  now?: Date
  role: string
  showFinancial: boolean
  dayReportsByDate: Map<string, DayReport>
  comparisonRowsByDate: Map<string, ComparisonRow[]>
  stationClosedDates: ReadonlySet<string>
  bankHolidayDates: ReadonlySet<string>
  acknowledgements: AckRow[]
  customerArImportLogs: CustomerArImportRow[]
  customerCompleteAcks: ReadonlySet<string>
  vendorInvoicesTouchedThisWeek: number
  vendorPendingCount: number
}

function timingStatus(asOf: string, dueDate: string): 'not_due' | 'due' | 'overdue' {
  if (compareYmd(asOf, dueDate) < 0) return 'not_due'
  if (compareYmd(asOf, dueDate) === 0) return 'due'
  return 'overdue'
}

function sectionForDue(asOf: string, dueDate: string): 'today' | 'soon' | 'week' {
  if (dueDate === asOf) return 'today'
  if (compareYmd(dueDate, asOf) > 0 && compareYmd(dueDate, addCalendarDaysYmd(asOf, 2)) <= 0) return 'soon'
  return 'week'
}

function depositComparisonStatus(rows: ComparisonRow[]): {
  status: ChecklistItemStatus
  summary: string
} {
  if (rows.length === 0) {
    return { status: 'na', summary: 'No deposit lines' }
  }
  const discrepancies = rows.filter((r) => r.bankStatus === 'discrepancy').length
  if (discrepancies > 0) {
    return { status: 'discrepancy', summary: `${discrepancies} discrepancy` }
  }
  const pending = rows.filter((r) => r.bankStatus !== 'cleared').length
  if (pending === 0) return { status: 'complete', summary: 'All cleared' }
  return { status: 'due', summary: `${pending} pending` }
}

function badgeWeight(status: ChecklistItemStatus): 0 | 1 {
  return status === 'due' ||
    status === 'overdue' ||
    status === 'incomplete' ||
    status === 'reopened' ||
    status === 'discrepancy'
    ? 1
    : 0
}

function isTimestampInWeek(iso: Date, weekKey: string): boolean {
  const start = weekKey
  const end = addCalendarDaysYmd(weekKey, 6)
  const ymd = iso.toISOString().slice(0, 10)
  return ymd >= start && ymd <= end
}

function ackForWeek(acks: AckRow[], taskId: string, weekKey: string, kind: ChecklistAckKind): AckRow | undefined {
  return acks.find((a) => a.taskId === taskId && a.weekKey === weekKey && a.kind === kind)
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

function buildShiftCloseGroup(input: BuildInput): ChecklistItem {
  const { asOf, now = new Date(), dayReportsByDate, stationClosedDates } = input
  const currentWeekStart = weekKeyMonday(asOf)
  const currentWeekEnd = weekDueSunday(currentWeekStart)
  const windowStart = CHECKLIST_EPOCH_YMD
  const latestWorkDate = addCalendarDaysYmd(asOf, -1)

  const subtasks: ChecklistSubtask[] = []

  if (compareYmd(latestWorkDate, windowStart) >= 0) {
    for (const workDate of enumerateYmdRange(windowStart, latestWorkDate)) {
      const bucket = compareYmd(workDate, currentWeekStart) >= 0 ? 'current_week' : 'backlog'
      if (bucket === 'current_week' && compareYmd(workDate, currentWeekEnd) > 0) continue

      const sub = buildShiftCloseSubtask({
        workDate,
        bucket,
        report: dayReportsByDate.get(workDate),
        stationClosed: stationClosedDates.has(workDate),
        asOf,
        now
      })
      if (sub) subtasks.push(sub)
    }
  }

  const sorted = sortSubtasks(subtasks)
  const badge = sorted.reduce((n, s) => n + s.badgeWeight, 0)
  const status = worstShiftStatus(sorted)
  const currentWeekCount = sorted.filter((s) => s.bucket === 'current_week').length
  const backlogCount = sorted.filter((s) => s.bucket === 'backlog').length

  let summary = 'All shifts complete'
  if (sorted.length > 0) {
    const parts: string[] = []
    if (currentWeekCount > 0) parts.push(`${currentWeekCount} this week`)
    if (backlogCount > 0) parts.push(`${backlogCount} in backlog`)
    summary = parts.join(', ')
  }

  return {
    id: 'shift-close',
    label: 'Update Shift',
    section: sectionForShiftParent(sorted, asOf),
    status: sorted.length === 0 ? 'complete' : status,
    summary,
    href: '/days',
    badgeWeight: badge > 0 ? 1 : 0,
    children: sorted
  }
}

export function buildOperationsChecklist(input: BuildInput): OperationsChecklistPayload {
  const {
    asOf,
    now,
    showFinancial,
    dayReportsByDate,
    comparisonRowsByDate,
    stationClosedDates,
    bankHolidayDates,
    acknowledgements,
    customerArImportLogs,
    customerCompleteAcks,
    vendorInvoicesTouchedThisWeek,
    vendorPendingCount
  } = input

  const items: ChecklistItem[] = [buildShiftCloseGroup(input)]

  if (CHECKLIST_ENABLE_CUSTOMER_ACCOUNTS) {
    items.push(
      buildCustomerAccountsGroup({
        asOf,
        now,
        importLogs: customerArImportLogs,
        completeAcks: customerCompleteAcks
      })
    )
  }

  if (showFinancial && (CHECKLIST_ENABLE_DEPOSIT_COMPARISON || CHECKLIST_ENABLE_VENDOR_INVOICES)) {
    const weekKey = weekKeyMonday(asOf)
    const weekSunday = weekDueSunday(weekKey)
    const latestWorkDate = addCalendarDaysYmd(asOf, -1)
    const depositWorkDates = enumerateYmdRange(CHECKLIST_EPOCH_YMD, latestWorkDate)

    if (CHECKLIST_ENABLE_DEPOSIT_COMPARISON) {
      for (const workDate of depositWorkDates) {
      if (stationClosedDates.has(workDate)) continue
      const report = dayReportsByDate.get(workDate)
      const compDue = depositComparisonDueDate(workDate, bankHolidayDates)
      const compRows = comparisonRowsByDate.get(workDate) ?? []
      const hasClosedShifts = report?.shifts.some(
        (s) => s.status === 'closed' || s.status === 'reviewed'
      )
      const shiftDone = report ? evaluateShiftClose(report, false).outcome === 'complete' : false
      const compEval = depositComparisonStatus(compRows)

      let compStatus = compEval.status
      if (compStatus !== 'na' && compStatus !== 'complete') {
        const timing = timingStatus(asOf, compDue)
        if (timing === 'not_due') compStatus = 'not_due'
        else if (!hasClosedShifts || !shiftDone) compStatus = 'blocked'
        else if (compEval.status === 'discrepancy') compStatus = 'discrepancy'
        else compStatus = timing
      }

      if (compStatus === 'na' || compStatus === 'complete' || compStatus === 'not_due') continue

      items.push({
        id: `deposit-comparison:${workDate}`,
        label: 'Bank deposit & comparison',
        section: sectionForDue(asOf, compDue),
        status: compStatus,
        workDate,
        dueDate: compDue,
        summary: compEval.summary,
        href: `/financial/deposit-comparisons?date=${workDate}`,
        blockedBy: !hasClosedShifts || !shiftDone ? ['shift-close'] : undefined,
        badgeWeight: badgeWeight(compStatus)
      })
      }
    }

    if (CHECKLIST_ENABLE_VENDOR_INVOICES) {
      const weekKey = weekKeyMonday(asOf)
      const weekSunday = weekDueSunday(weekKey)
      const weekTiming = timingStatus(asOf, weekSunday)
      const weekSection: 'today' | 'soon' | 'week' =
        compareYmd(asOf, weekSunday) >= 0 ? 'today' : compareYmd(weekSunday, asOf) <= 2 ? 'soon' : 'week'

    const vendorStarted = ackForWeek(acknowledgements, 'vendor-invoices', weekKey, 'started')
    const vendorCompleteAck = ackForWeek(acknowledgements, 'vendor-invoices', weekKey, 'complete')
    const vendorTouched = vendorInvoicesTouchedThisWeek > 0

    let vendorStatus: ChecklistItemStatus = 'not_due'
    if (vendorCompleteAck || (vendorTouched && vendorPendingCount === 0)) vendorStatus = 'complete'
    else if (vendorStarted || (vendorTouched && vendorPendingCount > 0)) vendorStatus = 'in_progress'
    else if (weekTiming === 'overdue') vendorStatus = 'overdue'
    else if (weekTiming === 'due') vendorStatus = 'due'

    if (vendorStatus !== 'complete' && vendorStatus !== 'not_due') {
      items.push({
        id: `vendor-invoices:${weekKey}`,
        label: 'Update vendor invoices',
        section: weekSection,
        status: vendorStatus,
        weekKey,
        dueDate: weekSunday,
        summary: vendorCompleteAck
          ? 'Marked complete'
          : vendorTouched
            ? `${vendorInvoicesTouchedThisWeek} touched, ${vendorPendingCount} pending`
            : 'Weekly entry (usually Sunday)',
        href: '/vendor-payments/invoices',
        badgeWeight: badgeWeight(vendorStatus),
        actions: ['mark_in_progress', 'mark_complete']
      })
    }
    }
  }

  const flatStatuses = items.flatMap((item) =>
    item.children?.length ? item.children.map((c) => c.status) : [item.status]
  )

  const counts = {
    due: flatStatuses.filter((s) => s === 'due').length,
    overdue: flatStatuses.filter((s) => s === 'overdue').length,
    incomplete: flatStatuses.filter((s) => s === 'incomplete').length,
    reopened: flatStatuses.filter((s) => s === 'reopened').length,
    inProgress: flatStatuses.filter((s) => s === 'in_progress').length,
    notDue: flatStatuses.filter((s) => s === 'not_due').length,
    complete: flatStatuses.filter((s) => s === 'complete').length
  }

  const sortOrder: Record<ChecklistItemStatus, number> = {
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

  items.sort((a, b) => {
    const s = sortOrder[a.status] - sortOrder[b.status]
    if (s !== 0) return s
    return a.id.localeCompare(b.id)
  })

  return { asOf, items, counts }
}
