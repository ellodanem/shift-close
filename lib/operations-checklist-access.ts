import { isFinancialPowerRole, isFullAccessRole, isOperationsManagerRole, isSupervisorLike } from '@/lib/roles'

export function canAccessOperationsChecklist(role: string): boolean {
  return (
    isFullAccessRole(role) ||
    isOperationsManagerRole(role) ||
    isSupervisorLike(role)
  )
}

export function canSeeFinancialChecklistItems(role: string): boolean {
  return isFinancialPowerRole(role)
}

export function canAcknowledgeWeeklyChecklist(role: string): boolean {
  return isFullAccessRole(role)
}
