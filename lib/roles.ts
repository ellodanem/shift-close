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

/** Normalize role for comparisons (DB/JWT may vary in casing). */
export function normalizeAppRole(role: string): string {
  return role.trim().toLowerCase()
}

export function isFullAccessRole(role: string): boolean {
  const r = normalizeAppRole(role)
  return r === 'admin' || r === 'manager'
}

export function isSupervisorLike(role: string): boolean {
  const r = normalizeAppRole(role)
  return r === 'supervisor' || r === 'senior_supervisor'
}

/** NIC, bank account — only admin/manager (not supervisors; not stakeholders). */
export function canViewStaffSensitiveFields(role: string): boolean {
  return isFullAccessRole(role)
}

export function canEditRoster(role: string): boolean {
  const r = normalizeAppRole(role)
  if (isFullAccessRole(role)) return true
  if (r === 'stakeholder') return false
  return !isSupervisorLike(role)
}

export function canManageAppUsers(role: string): boolean {
  const r = normalizeAppRole(role)
  return r === 'admin' || r === 'manager'
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

/** Display name for nav/header: "First Last" when present, else username. */
export function formatAppUserDisplayName(u: {
  username: string
  firstName?: string | null
  lastName?: string | null
}): string {
  const fn = u.firstName?.trim()
  const ln = u.lastName?.trim()
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ')
  return u.username
}

export function getDashboardWidgetIdsForRole(role: string | undefined): DashboardWidgetId[] | 'all' {
  if (!role || isFullAccessRole(role)) return 'all'
  const r = normalizeAppRole(role)
  if (r === 'stakeholder') return [...STAKEHOLDER_DASHBOARD_WIDGETS]
  if (isSupervisorLike(role)) return [...SUPERVISOR_DASHBOARD_WIDGETS]
  return 'all'
}
