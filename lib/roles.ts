import type { DashboardWidgetId } from '@/lib/dashboard-layout'

/** Application roles for AppUser */
export type AppRole =
  | 'admin'
  | 'manager'
  | 'operations_manager'
  | 'senior_supervisor'
  | 'supervisor'
  | 'stakeholder'

export const APP_ROLES: AppRole[] = [
  'admin',
  'manager',
  'operations_manager',
  'senior_supervisor',
  'supervisor',
  'stakeholder'
]

/**
 * Normalize role for comparisons (DB/JWT may vary in casing/spacing).
 * Human-entered values like "operations manager" must match `operations_manager`.
 */
export function normalizeAppRole(role: string): string {
  return role
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Full financial + unrestricted app areas (cashbook, vendor/fuel payments, financial reports). */
export function isFullAccessRole(role: string): boolean {
  const r = normalizeAppRole(role)
  return r === 'admin' || r === 'manager'
}

export function isOperationsManagerRole(role: string): boolean {
  return normalizeAppRole(role) === 'operations_manager'
}

/** Page + API paths blocked for operations_manager (no financial module). */
export function isPathBlockedForOperationsManager(pathname: string): boolean {
  const blockedPagePrefixes = [
    '/financial',
    '/fuel-payments',
    '/vendor-payments',
    '/customer-accounts',
    '/account-customers',
    '/reports/financial',
    '/reports/monthly',
    '/reports/daily-financial-summary'
  ]
  if (blockedPagePrefixes.some((p) => pathname.startsWith(p))) return true
  if (pathname.startsWith('/api/financial')) return true
  if (pathname.startsWith('/api/fuel-payments')) return true
  if (pathname.startsWith('/api/vendor-payments')) return true
  if (pathname.startsWith('/api/customer-accounts')) return true
  if (pathname.startsWith('/api/account-customers')) return true
  if (pathname.startsWith('/api/reports/monthly')) return true
  if (pathname.startsWith('/api/reports/daily-financial-summary')) return true
  return false
}

/**
 * Roles with full financial module access (cashbook, payments, financial reports).
 * Distinct from user-management rules for operations managers.
 */
export function isFinancialPowerRole(role: string): boolean {
  return isFullAccessRole(role)
}

/** The administrator app role — only this tier cannot be assigned or edited by operations managers. */
export function isAdministratorRole(role: string): boolean {
  return normalizeAppRole(role) === 'admin'
}

export function isSupervisorLike(role: string): boolean {
  const r = normalizeAppRole(role)
  return r === 'supervisor' || r === 'senior_supervisor'
}

/** NIC, bank account — admin/manager/operations_manager (not supervisors; not stakeholders). */
export function canViewStaffSensitiveFields(role: string): boolean {
  return isFullAccessRole(role) || isOperationsManagerRole(role)
}

export function canEditRoster(role: string): boolean {
  const r = normalizeAppRole(role)
  if (isFullAccessRole(role)) return true
  if (r === 'operations_manager') return true
  if (r === 'stakeholder') return false
  return !isSupervisorLike(role)
}

export function canManageAppUsers(role: string): boolean {
  const r = normalizeAppRole(role)
  return r === 'admin' || r === 'manager' || r === 'operations_manager'
}

/** Toggle station closed on public holidays (settings UI + PATCH). */
export function canManagePublicHolidaySettings(role: string): boolean {
  return isFullAccessRole(role) || isOperationsManagerRole(role)
}

/** Archived attendance punches (before last saved pay period) — only these roles may load them in the log API. */
export function canViewArchivedAttendanceLogs(role: string): boolean {
  const r = normalizeAppRole(role)
  return r === 'admin' || r === 'manager' || r === 'operations_manager'
}

/** Expected revenue / deposit scans insights pages. */
export function canAccessInsightsPages(role: string): boolean {
  const r = normalizeAppRole(role)
  return r === 'stakeholder' || isFullAccessRole(role) || isOperationsManagerRole(role)
}

/** Roles this actor may set when creating or editing a user. */
export function getAssignableRolesForActor(actorRole: string): AppRole[] {
  const actor = normalizeAppRole(actorRole)
  if (actor === 'admin' || actor === 'manager') return [...APP_ROLES]
  if (actor === 'operations_manager') {
    return APP_ROLES.filter((r) => !isAdministratorRole(r))
  }
  return []
}

export function canAssignAppRole(actorRole: string, targetRole: string): boolean {
  const assignable = getAssignableRolesForActor(actorRole)
  const t = normalizeAppRole(targetRole)
  return assignable.includes(t as AppRole)
}

/** PATCH/DELETE target user — operations managers cannot change administrator accounts. */
export function canManageExistingAppUser(actorRole: string, targetUserRole: string): boolean {
  if (!canManageAppUsers(actorRole)) return false
  const actor = normalizeAppRole(actorRole)
  const target = normalizeAppRole(targetUserRole)
  if (actor === 'admin' || actor === 'manager') return true
  if (actor === 'operations_manager') return !isAdministratorRole(target)
  return false
}

/** Dashboard widgets for supervisor / senior_supervisor: ops status + upcoming only. */
export const SUPERVISOR_DASHBOARD_WIDGETS: DashboardWidgetId[] = [
  'month-summary',
  'fuel-mtd-deposit-block',
  'phase1-status'
]

/** Stakeholder: high-level totals + fuel/deposit + last-5-day volume + recent fuel payment; no ops status row. */
export const STAKEHOLDER_DASHBOARD_WIDGETS: DashboardWidgetId[] = [
  'month-summary',
  'fuel-mtd-deposit-block',
  'fuel-volume',
  'recent-fuel-payment'
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
  if (!role || isFullAccessRole(role) || isOperationsManagerRole(role)) return 'all'
  const r = normalizeAppRole(role)
  if (r === 'stakeholder') return [...STAKEHOLDER_DASHBOARD_WIDGETS]
  if (isSupervisorLike(role)) return [...SUPERVISOR_DASHBOARD_WIDGETS]
  return 'all'
}
