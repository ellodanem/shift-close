import { isAdministratorRole } from '@/lib/roles'

export type OperationsChecklistUser = {
  role: string
  isSuperAdmin?: boolean
}

/** Admin role, or the super-admin account (owner). Not managers, ops, or supervisors. */
export function canAccessOperationsChecklist(user: OperationsChecklistUser): boolean {
  return isAdministratorRole(user.role) || user.isSuperAdmin === true
}

export function canSeeFinancialChecklistItems(user: OperationsChecklistUser): boolean {
  return canAccessOperationsChecklist(user)
}

export function canAcknowledgeWeeklyChecklist(user: OperationsChecklistUser): boolean {
  return canAccessOperationsChecklist(user)
}
