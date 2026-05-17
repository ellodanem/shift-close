import { canEditRoster, isFullAccessRole, isOperationsManagerRole, isSupervisorLike } from '@/lib/roles'

/** Canonical route for the mobile roster manager. */
export const ROSTER_MOBILE_PATH = '/roster/mobile'

export const ROSTER_MOBILE_VIEW_KEY = 'shift-close-roster-mobile-view'

export type RosterMobileViewMode = 'day' | 'staff' | 'week'

export function canAccessRosterMobile(role: string): boolean {
  if (isFullAccessRole(role) || isOperationsManagerRole(role)) return true
  return isSupervisorLike(role)
}

export function canEditRosterMobile(role: string): boolean {
  return canEditRoster(role)
}

export function isRosterMobilePath(pathname: string): boolean {
  return pathname === ROSTER_MOBILE_PATH
}

export function readStoredRosterView(): RosterMobileViewMode {
  if (typeof window === 'undefined') return 'week'
  try {
    const v = localStorage.getItem(ROSTER_MOBILE_VIEW_KEY)
    if (v === 'day' || v === 'staff' || v === 'week') return v
    return 'week'
  } catch {
    return 'week'
  }
}

export function storeRosterView(mode: RosterMobileViewMode): void {
  try {
    localStorage.setItem(ROSTER_MOBILE_VIEW_KEY, mode)
  } catch {
    // ignore
  }
}
