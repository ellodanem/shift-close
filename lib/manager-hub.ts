import { ATTENDANCE_VIEWER_PATH, canAccessAttendanceViewer } from '@/lib/attendance-viewer'
import { ROSTER_MOBILE_PATH, canAccessRosterMobile } from '@/lib/roster-mobile'

/** Landing page with links to mobile manager tools. */
export const MANAGER_HUB_PATH = '/manager'

export function canAccessManagerHub(role: string): boolean {
  return canAccessAttendanceViewer(role) || canAccessRosterMobile(role)
}

export function isManagerHubPath(pathname: string): boolean {
  return pathname === MANAGER_HUB_PATH
}

export const HOME_PATH_PRESETS = [
  { value: '', label: 'Default (Dashboard)' },
  { value: MANAGER_HUB_PATH, label: 'Manager hub (mobile)' },
  { value: ATTENDANCE_VIEWER_PATH, label: 'Attendance viewer' },
  { value: ROSTER_MOBILE_PATH, label: 'Roster (mobile)' }
] as const
