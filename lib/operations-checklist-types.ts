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

/** Weeks of backlog before the current Mon–Sun week. */
export const BACKLOG_WEEKS = 12

export const BACKLOG_DAYS = BACKLOG_WEEKS * 7

/** @deprecated Use week window + backlog instead. */
export const ROLLING_WORK_DAYS = 7
