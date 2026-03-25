import type { DashboardWidgetId } from '@/lib/dashboard-layout'

/** Application roles for AppUser */
export type AppRole =
  | 'admin'
  | 'manager'
  | 'senior_supervisor'
  | 'supervisor'
  | 'stakeholder'

export const APP_ROLES: AppRole[] = [
  'admin',
  'manager',
  'senior_supervisor',
  'supervisor',
  'stakeholder'
]

export function isFullAccessRole(role: string): boolean {
  return role === 'admin' || role === 'manager'
}

export function isSupervisorLike(role: string): boolean {
  return role === 'supervisor' || role === 'senior_supervisor'
}

/** NIC, bank account — only admin/manager (not supervisors; not stakeholders). */
export function canViewStaffSensitiveFields(role: string): boolean {
  return isFullAccessRole(role)
}

export function canEditRoster(role: string): boolean {
  if (isFullAccessRole(role)) return true
  if (role === 'stakeholder') return false
  return !isSupervisorLike(role)
}

export function canManageAppUsers(role: string): boolean {
  return role === 'admin' || role === 'manager'
}

/** Dashboard widgets for supervisor / senior_supervisor: ops status + upcoming only. */
export const SUPERVISOR_DASHBOARD_WIDGETS: DashboardWidgetId[] = [
  'month-summary',
  'phase1-status',
  'upcoming-roster'
]

/** Stakeholder: minimal dashboard + link to overseer scans. */
export const STAKEHOLDER_DASHBOARD_WIDGETS: DashboardWidgetId[] = [
  'month-summary',
  'phase1-status',
  'upcoming-roster'
]

export function getDashboardWidgetIdsForRole(role: string | undefined): DashboardWidgetId[] | 'all' {
  if (!role || isFullAccessRole(role)) return 'all'
  if (role === 'stakeholder') return [...STAKEHOLDER_DASHBOARD_WIDGETS]
  if (isSupervisorLike(role)) return [...SUPERVISOR_DASHBOARD_WIDGETS]
  return 'all'
}
