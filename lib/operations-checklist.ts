import type { DayReport } from '@/lib/types'
import type { ComparisonRow } from '@/lib/deposit-comparison-rows'
import { formatDateOnlyForDisplay, addCalendarDaysYmd } from '@/lib/datetime-policy'
import {
  compareYmd,
  depositComparisonDueDate,
  shiftEntryDueDate,
  weekDueSunday,
  weekKeyMonday
} from '@/lib/operations-checklist-due-dates'
import type {
  ChecklistAckKind,
  ChecklistItem,
  ChecklistItemStatus,
  OperationsChecklistPayload
} from '@/lib/operations-checklist-types'
import { ROLLING_WORK_DAYS } from '@/lib/operations-checklist-types'

export { ROLLING_WORK_DAYS }

type AckRow = {
  taskId: string
  weekKey: string
  kind: string
  note: string | null
}

type BuildInput = {
  asOf: string
  role: string
  showFinancial: boolean
  dayReportsByDate: Map<string, DayReport>
  comparisonRowsByDate: Map<string, ComparisonRow[]>
  stationClosedDates: ReadonlySet<string>
  bankHolidayDates: ReadonlySet<string>
  acknowledgements: AckRow[]
  customerArUpdatedAt: Date | null
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

function shiftCloseComplete(report: DayReport, stationClosed: boolean): { ok: boolean; summary: string } {
  if (stationClosed) return { ok: true, summary: 'Station closed' }

  const reopened = report.shifts.some((s) => s.status === 'reopened')
  if (reopened) return { ok: false, summary: 'Reopened shift needs re-close' }

  if (report.status !== 'Complete') {
    if (report.status === 'Invalid mix') return { ok: false, summary: 'Invalid shift mix' }
    const missing = []
    const types = new Set(report.shifts.map((s) => s.shift))
    if (!types.has('6-1')) missing.push('6-1')
    if (!types.has('1-9') && report.dayType === 'Standard') missing.push('1-9')
    if (report.shifts.some((s) => s.status === 'draft')) missing.push('draft')
    return { ok: false, summary: missing.length ? `Missing: ${missing.join(', ')}` : 'Incomplete' }
  }

  const issues: string[] = []
  if (report.missingDepositSlipAlertOpen) issues.push('missing deposit slip')

  const needsDeposits = report.totals.totalDeposits > 0
  const needsDebits = report.totals.totalDebit > 0 || report.totals.totalCredit > 0

  if (needsDeposits && report.depositScans.length === 0) issues.push('deposit scans')
  if (needsDebits && report.debitScans.length === 0) issues.push('debit scans')
  if (
    !report.securityScanWaived &&
    (needsDeposits || needsDebits) &&
    (report.securityScans?.length ?? 0) === 0
  ) {
    issues.push('security scans')
  }

  if (issues.length) return { ok: false, summary: issues.join(', ') }
  return { ok: true, summary: 'Complete' }
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
  return status === 'due' || status === 'overdue' || status === 'discrepancy' ? 1 : 0
}

function workDateLabel(ymd: string): string {
  return formatDateOnlyForDisplay(ymd)
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

export function buildOperationsChecklist(input: BuildInput): OperationsChecklistPayload {
  const {
    asOf,
    role: _role,
    showFinancial,
    dayReportsByDate,
    comparisonRowsByDate,
    stationClosedDates,
    bankHolidayDates,
    acknowledgements,
    customerArUpdatedAt,
    vendorInvoicesTouchedThisWeek,
    vendorPendingCount
  } = input

  const items: ChecklistItem[] = []
  const weekKey = weekKeyMonday(asOf)
  const weekSunday = weekDueSunday(weekKey)

  const workDates: string[] = []
  for (let i = ROLLING_WORK_DAYS + 1; i >= 1; i--) {
    workDates.push(addCalendarDaysYmd(asOf, -i))
  }

  for (const workDate of workDates) {
    const stationClosed = stationClosedDates.has(workDate)
    const report = dayReportsByDate.get(workDate)
    const shiftDue = shiftEntryDueDate(workDate)

    if (stationClosed) continue

    if (!report) {
      const timing = timingStatus(asOf, shiftDue)
      if (timing === 'not_due' && compareYmd(shiftDue, addCalendarDaysYmd(asOf, 2)) > 0) continue
      items.push({
        id: `shift-close:${workDate}`,
        label: 'Update shift',
        section: sectionForDue(asOf, shiftDue),
        status: timing === 'not_due' ? 'not_due' : timing,
        workDate,
        dueDate: shiftDue,
        summary: 'No shifts recorded',
        href: `/days?date=${workDate}`,
        badgeWeight: timing === 'not_due' ? 0 : 1
      })
      continue
    }

    const shiftEval = shiftCloseComplete(report, false)
    let shiftStatus: ChecklistItemStatus
    if (shiftEval.ok) {
      shiftStatus = 'complete'
    } else {
      const timing = timingStatus(asOf, shiftDue)
      shiftStatus = timing === 'not_due' ? 'not_due' : timing
    }

    items.push({
      id: `shift-close:${workDate}`,
      label: 'Update shift',
      section: sectionForDue(asOf, shiftDue),
      status: shiftStatus,
      workDate,
      dueDate: shiftDue,
      summary: `${workDateLabel(workDate)} — ${shiftEval.summary}`,
      href: `/days?date=${workDate}`,
      badgeWeight: badgeWeight(shiftStatus)
    })

    if (!showFinancial) continue

    const compDue = depositComparisonDueDate(workDate, bankHolidayDates)
    const compRows = comparisonRowsByDate.get(workDate) ?? []
    const hasClosedShifts = report.shifts.some(
      (s) => s.status === 'closed' || s.status === 'reviewed'
    )
    const shiftDone = shiftEval.ok
    const compEval = depositComparisonStatus(compRows)

    let compStatus = compEval.status
    if (compStatus !== 'na' && compStatus !== 'complete') {
      const timing = timingStatus(asOf, compDue)
      if (timing === 'not_due') compStatus = 'not_due'
      else if (!hasClosedShifts || !shiftDone) compStatus = 'blocked'
      else if (compEval.status === 'discrepancy') compStatus = 'discrepancy'
      else compStatus = timing
    }

    if (compStatus === 'na') continue

    items.push({
      id: `deposit-comparison:${workDate}`,
      label: 'Bank deposit & comparison',
      section: sectionForDue(asOf, compDue),
      status: compStatus,
      workDate,
      dueDate: compDue,
      summary: `${workDateLabel(workDate)} — ${compEval.summary}`,
      href: `/financial/deposit-comparisons?date=${workDate}`,
      blockedBy: !hasClosedShifts || !shiftDone ? ['shift-close'] : undefined,
      badgeWeight: badgeWeight(compStatus)
    })
  }

  if (showFinancial) {
    const weekTiming = timingStatus(asOf, weekSunday)

    const customerTouched =
      customerArUpdatedAt != null && isTimestampInWeek(customerArUpdatedAt, weekKey)
    const customerStarted = ackForWeek(acknowledgements, 'customer-accounts', weekKey, 'started')
    const customerCompleteAck = ackForWeek(acknowledgements, 'customer-accounts', weekKey, 'complete')

    let customerStatus: ChecklistItemStatus = 'not_due'
    if (customerCompleteAck || customerTouched) customerStatus = 'complete'
    else if (customerStarted) customerStatus = 'in_progress'
    else if (weekTiming === 'overdue') customerStatus = 'overdue'
    else if (weekTiming === 'due') customerStatus = 'due'

    const weekSection: 'today' | 'soon' | 'week' =
      compareYmd(asOf, weekSunday) >= 0 ? 'today' : compareYmd(weekSunday, asOf) <= 2 ? 'soon' : 'week'

    items.push({
      id: `customer-accounts:${weekKey}`,
      label: 'Update customer accounts',
      section: weekSection,
      status: customerStatus,
      weekKey,
      dueDate: weekSunday,
      summary: customerTouched || customerCompleteAck ? 'Updated this week' : 'Weekly update due Sunday',
      href: '/customer-accounts',
      badgeWeight: badgeWeight(customerStatus),
      actions: customerStatus !== 'complete' ? ['mark_in_progress', 'mark_complete'] : undefined
    })

    const vendorStarted = ackForWeek(acknowledgements, 'vendor-invoices', weekKey, 'started')
    const vendorCompleteAck = ackForWeek(acknowledgements, 'vendor-invoices', weekKey, 'complete')
    const vendorTouched = vendorInvoicesTouchedThisWeek > 0

    let vendorStatus: ChecklistItemStatus = 'not_due'
    if (vendorCompleteAck || (vendorTouched && vendorPendingCount === 0)) vendorStatus = 'complete'
    else if (vendorStarted || (vendorTouched && vendorPendingCount > 0)) vendorStatus = 'in_progress'
    else if (weekTiming === 'overdue') vendorStatus = 'overdue'
    else if (weekTiming === 'due') vendorStatus = 'due'

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
      actions: vendorStatus !== 'complete' ? ['mark_in_progress', 'mark_complete'] : undefined
    })
  }

  const visible = items.filter((i) => i.status !== 'complete' && i.status !== 'na')

  const counts = {
    due: visible.filter((i) => i.status === 'due').length,
    overdue: visible.filter((i) => i.status === 'overdue').length,
    inProgress: visible.filter((i) => i.status === 'in_progress').length,
    notDue: visible.filter((i) => i.status === 'not_due').length,
    complete: items.filter((i) => i.status === 'complete').length
  }

  const sortOrder: Record<ChecklistItemStatus, number> = {
    overdue: 0,
    discrepancy: 1,
    due: 2,
    in_progress: 3,
    blocked: 4,
    not_due: 5,
    complete: 6,
    na: 7
  }

  visible.sort((a, b) => {
    const s = sortOrder[a.status] - sortOrder[b.status]
    if (s !== 0) return s
    return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  })

  return { asOf, items: visible, counts }
}
