import type { DayReport } from '@/lib/types'
import { formatWorkDateLabelLong } from '@/lib/datetime-policy'
import type { ChecklistItemStatus, ChecklistSubtask, ChecklistSubtaskBucket } from '@/lib/operations-checklist-types'
import {
  shiftEntryDueDate,
  shiftEntryTimingStatus,
  type ShiftEntryTiming
} from '@/lib/operations-checklist-due-dates'

export type ShiftCloseReasonCode =
  | 'no_shifts'
  | 'missing_shift'
  | 'draft'
  | 'invalid_mix'
  | 'deposit_scans'
  | 'debit_scans'
  | 'security_scans'
  | 'missing_slip_alert'
  | 'reopened'

export type ShiftCloseEvalResult =
  | { outcome: 'complete' }
  | { outcome: 'reopened'; reason: string; reasonCode: 'reopened' }
  | {
      outcome: 'incomplete'
      reason: string
      reasonCode: ShiftCloseReasonCode
      started: boolean
    }
  | { outcome: 'na' }

export function evaluateShiftClose(
  report: DayReport | undefined,
  stationClosed: boolean
): ShiftCloseEvalResult {
  if (stationClosed) return { outcome: 'na' }

  if (!report || report.shifts.length === 0) {
    return {
      outcome: 'incomplete',
      reason: 'No shifts recorded',
      reasonCode: 'no_shifts',
      started: false
    }
  }

  const reopened = report.shifts.some((s) => s.status === 'reopened')
  if (reopened) {
    return {
      outcome: 'reopened',
      reason: 'Reopened shift needs re-close',
      reasonCode: 'reopened'
    }
  }

  if (report.status === 'Invalid mix') {
    return {
      outcome: 'incomplete',
      reason: 'Invalid shift mix (standard + custom)',
      reasonCode: 'invalid_mix',
      started: true
    }
  }

  if (report.status !== 'Complete') {
    const types = new Set(report.shifts.map((s) => s.shift))
    const missing: string[] = []
    if (report.dayType === 'Standard') {
      if (!types.has('6-1')) missing.push('6-1')
      if (!types.has('1-9')) missing.push('1-9')
    } else if (report.shifts.length !== 1) {
      missing.push('custom shift')
    }
    if (report.shifts.some((s) => s.status === 'draft')) {
      return {
        outcome: 'incomplete',
        reason: missing.length
          ? `Draft in progress — missing ${missing.join(', ')}`
          : 'Draft shift in progress',
        reasonCode: 'draft',
        started: true
      }
    }
    return {
      outcome: 'incomplete',
      reason: missing.length ? `Missing shift: ${missing.join(', ')}` : 'Shift data incomplete',
      reasonCode: 'missing_shift',
      started: true
    }
  }

  if (report.missingDepositSlipAlertOpen) {
    return {
      outcome: 'incomplete',
      reason: 'Missing deposit slip flagged',
      reasonCode: 'missing_slip_alert',
      started: true
    }
  }

  const scanIssues: { code: ShiftCloseReasonCode; label: string }[] = []
  const needsDeposits = report.totals.totalDeposits > 0
  const needsDebits = report.totals.totalDebit > 0 || report.totals.totalCredit > 0
  const depositSlipWaived = report.depositSlipUnavailableReason != null

  if (needsDeposits && report.depositScans.length === 0 && !depositSlipWaived) {
    scanIssues.push({ code: 'deposit_scans', label: 'Deposit scans not uploaded' })
  }
  if (needsDebits && report.debitScans.length === 0) {
    scanIssues.push({ code: 'debit_scans', label: 'Debit scans not uploaded' })
  }
  if (
    !report.securityScanWaived &&
    (needsDeposits || needsDebits) &&
    (report.securityScans?.length ?? 0) === 0
  ) {
    scanIssues.push({ code: 'security_scans', label: 'Security scans not uploaded' })
  }

  if (scanIssues.length > 0) {
    return {
      outcome: 'incomplete',
      reason: scanIssues.map((i) => i.label).join('; '),
      reasonCode: scanIssues[0].code,
      started: true
    }
  }

  return { outcome: 'complete' }
}

function subtaskBadgeWeight(status: ChecklistItemStatus): 0 | 1 {
  return status === 'due' ||
    status === 'overdue' ||
    status === 'incomplete' ||
    status === 'reopened' ||
    status === 'discrepancy'
    ? 1
    : 0
}

export function resolveShiftSubtaskStatus(
  evalResult: ShiftCloseEvalResult,
  timing: ShiftEntryTiming
): ChecklistItemStatus {
  if (evalResult.outcome === 'complete') return 'complete'
  if (evalResult.outcome === 'na') return 'na'
  if (evalResult.outcome === 'reopened') return 'reopened'
  if (timing === 'not_due') return 'not_due'
  if (evalResult.started) return 'incomplete'
  if (timing === 'overdue') return 'overdue'
  return 'due'
}

export function buildShiftCloseSubtask(params: {
  workDate: string
  bucket: ChecklistSubtaskBucket
  report: DayReport | undefined
  stationClosed: boolean
  asOf: string
  now?: Date
}): ChecklistSubtask | null {
  const { workDate, bucket, report, stationClosed, asOf, now = new Date() } = params
  const evalResult = evaluateShiftClose(report, stationClosed)
  if (evalResult.outcome === 'na') return null

  const timing = shiftEntryTimingStatus(asOf, workDate, now)
  const status = resolveShiftSubtaskStatus(evalResult, timing)
  if (status === 'complete' || status === 'not_due') return null

  const reason =
    evalResult.outcome === 'reopened'
      ? evalResult.reason
      : evalResult.outcome === 'incomplete'
        ? evalResult.reason
        : undefined

  return {
    id: `shift-close:${workDate}`,
    workDate,
    label: formatWorkDateLabelLong(workDate),
    status,
    reason,
    href: `/days?date=${workDate}`,
    badgeWeight: subtaskBadgeWeight(status),
    bucket,
    dueDate: shiftEntryDueDate(workDate)
  }
}

export function worstShiftStatus(subtasks: ChecklistSubtask[]): ChecklistItemStatus {
  if (subtasks.length === 0) return 'complete'
  const order: ChecklistItemStatus[] = [
    'overdue',
    'reopened',
    'discrepancy',
    'due',
    'incomplete',
    'in_progress',
    'blocked',
    'not_due',
    'complete',
    'na'
  ]
  let worst: ChecklistItemStatus = 'complete'
  let worstIdx = order.length
  for (const sub of subtasks) {
    const idx = order.indexOf(sub.status)
    if (idx >= 0 && idx < worstIdx) {
      worstIdx = idx
      worst = sub.status
    }
  }
  return worst
}

export function sectionForShiftParent(subtasks: ChecklistSubtask[], asOf: string): 'today' | 'soon' | 'week' {
  const hasBacklog = subtasks.some((s) => s.bucket === 'backlog')
  const hasDueToday = subtasks.some((s) => s.dueDate === asOf)
  if (hasDueToday) return 'today'
  if (hasBacklog) return 'week'
  return 'soon'
}
