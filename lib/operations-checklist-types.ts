export type ChecklistItemStatus =
  | 'complete'
  | 'not_due'
  | 'in_progress'
  | 'incomplete'
  | 'due'
  | 'overdue'
  | 'reopened'
  | 'blocked'
  | 'discrepancy'
  | 'na'

export type ChecklistSubtaskBucket = 'current_week' | 'backlog'

export type ChecklistSubtask = {
  id: string
  workDate: string
  label: string
  status: ChecklistItemStatus
  reason?: string
  href: string
  badgeWeight: 0 | 1
  bucket: ChecklistSubtaskBucket
  dueDate?: string
  weekKey?: string
  actions?: ('mark_complete' | 'mark_complete_with_note')[]
}

export type ChecklistItem = {
  id: string
  label: string
  section: 'today' | 'soon' | 'week'
  status: ChecklistItemStatus
  workDate?: string
  weekKey?: string
  dueDate?: string
  summary?: string
  href: string
  blockedBy?: string[]
  badgeWeight: 0 | 1
  children?: ChecklistSubtask[]
  actions?: ('mark_in_progress' | 'mark_complete' | 'snooze')[]
}

export type OperationsChecklistPayload = {
  asOf: string
  items: ChecklistItem[]
  counts: {
    due: number
    overdue: number
    incomplete: number
    reopened: number
    inProgress: number
    notDue: number
    complete: number
  }
}

export type ChecklistAckKind = 'started' | 'complete' | 'snooze' | 'waive'

/** Checklist fresh start — no work dates before this YMD are tracked. */
export const CHECKLIST_EPOCH_YMD = '2026-06-01'

/** Roll out checklist tasks one at a time. */
export const CHECKLIST_ENABLE_DEPOSIT_COMPARISON = false
export const CHECKLIST_ENABLE_CUSTOMER_ACCOUNTS = true
export const CHECKLIST_ENABLE_VENDOR_INVOICES = false

/** @deprecated Use per-task flags. */
export const CHECKLIST_ENABLE_WEEKLY_TASKS = CHECKLIST_ENABLE_CUSTOMER_ACCOUNTS || CHECKLIST_ENABLE_VENDOR_INVOICES

/** @deprecated Use CHECKLIST_EPOCH_YMD. */
export const BACKLOG_WEEKS = 12

/** @deprecated Use CHECKLIST_EPOCH_YMD. */
export const BACKLOG_DAYS = BACKLOG_WEEKS * 7

/** @deprecated Use week window + epoch instead. */
export const ROLLING_WORK_DAYS = 7
