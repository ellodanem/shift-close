export type ChecklistItemStatus =
  | 'complete'
  | 'not_due'
  | 'in_progress'
  | 'due'
  | 'overdue'
  | 'blocked'
  | 'discrepancy'
  | 'na'

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
  actions?: ('mark_in_progress' | 'mark_complete' | 'snooze')[]
}

export type OperationsChecklistPayload = {
  asOf: string
  items: ChecklistItem[]
  counts: {
    due: number
    overdue: number
    inProgress: number
    notDue: number
    complete: number
  }
}

export type ChecklistAckKind = 'started' | 'complete' | 'snooze' | 'waive'

export const ROLLING_WORK_DAYS = 7
