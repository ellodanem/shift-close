import { ATTENDANCE_VIEWER_PATH, canAccessAttendanceViewer } from '@/lib/attendance-viewer'
import { ROSTER_MOBILE_PATH, canAccessRosterMobile } from '@/lib/roster-mobile'
import { SCANS_MOBILE_PATH, canAccessScansMobile } from '@/lib/scans-mobile'
import { isFullAccessRole, isOperationsManagerRole } from '@/lib/roles'

/** Launcher for desktop full app and focused mobile manager tools. */
export const MANAGER_HUB_PATH = '/manager'

export const MANAGER_HUB_DESKTOP_PATH = '/dashboard'

export function canAccessManagerHubDesktop(role: string): boolean {
  return isFullAccessRole(role) || isOperationsManagerRole(role)
}

export function canAccessManagerHub(role: string): boolean {
  return (
    canAccessManagerHubDesktop(role) ||
    canAccessAttendanceViewer(role) ||
    canAccessRosterMobile(role) ||
    canAccessScansMobile(role)
  )
}

export function isManagerHubPath(pathname: string): boolean {
  return pathname === MANAGER_HUB_PATH
}

export const HOME_PATH_PRESETS = [
  { value: '', label: 'Default (Dashboard)' },
  { value: MANAGER_HUB_PATH, label: 'Manager hub' },
  { value: ATTENDANCE_VIEWER_PATH, label: 'Attendance viewer' },
  { value: ROSTER_MOBILE_PATH, label: 'Roster (mobile)' },
  { value: SCANS_MOBILE_PATH, label: 'Debit scans (mobile)' }
] as const
