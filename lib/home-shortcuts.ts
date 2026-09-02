import { ATTENDANCE_VIEWER_PATH, canAccessAttendanceViewer } from '@/lib/attendance-viewer'
import { MANAGER_HUB_PATH, canAccessManagerHub } from '@/lib/manager-hub'
import { ROSTER_MOBILE_PATH, canAccessRosterMobile } from '@/lib/roster-mobile'
import { SCANS_MOBILE_PATH, canAccessScansMobile } from '@/lib/scans-mobile'
import {
  isFullAccessRole,
  isOperationsManagerRole,
  isPathBlockedForOperationsManager,
  isSupervisorLike,
  normalizeAppRole
} from '@/lib/roles'

export type HomeShortcutId =
  | 'end-of-day'
  | 'uncashed-checks'
  | 'fuel-payments'
  | 'fuel-batches'
  | 'fuel-monthly'
  | 'roster'
  | 'attendance'
  | 'pay-period'
  | 'cashbook'
  | 'vendor-payments'
  | 'staff'
  | 'time-off'
  | 'debit-scans'
  | 'expected-revenue'
  | 'deposit-scans'
  | 'deposit-comparisons'
  | 'customer-accounts'
  | 'shifts'
  | 'reports-center'
  | 'applications'
  | 'shift-presets'
  | 'late-absent'
  | 'financial-report'
  | 'monthly-report'
  | 'daily-summary'
  | 'manager-hub'
  | 'roster-mobile'
  | 'attendance-viewer'
  | 'settings'
  | 'settings-users'
  | 'settings-fuel-data'
  | 'settings-smtp'
  | 'settings-email-recipients'
  | 'settings-end-of-day-email'
  | 'settings-missing-deposit-slip'
  | 'settings-pay-days'
  | 'settings-public-holidays'
  | 'settings-roster'
  | 'settings-staff-roles'
  | 'settings-vendor-vat'
  | 'settings-harvest-agent'
  | 'report-staff-roster'
  | 'report-weekly'
  | 'report-supervisor'
  | 'report-over-short'
  | 'report-fuel-comparison'
  | 'report-vendor-invoices'
  | 'report-deposit'
  | 'report-exception'

export type HomeShortcut = {
  id: HomeShortcutId
  label: string
  href: string
  tileClass: string
  matchPrefixes: string[]
}


export const HOME_SHORTCUTS: HomeShortcut[] = [
  {
    id: 'pay-period',
    label: 'Pay period report',
    href: '/attendance/pay-period',
    tileClass: 'bg-violet-600',
    matchPrefixes: ['/attendance/pay-period']
  },
  {
    id: 'late-absent',
    label: 'Late & absent',
    href: '/attendance/late-absent',
    tileClass: 'bg-amber-700',
    matchPrefixes: ['/attendance/late-absent']
  },
  {
    id: 'uncashed-checks',
    label: 'Uncashed checks',
    href: '/vendor-payments/uncashed-checks',
    tileClass: 'bg-amber-500',
    matchPrefixes: ['/vendor-payments/uncashed-checks']
  },
  {
    id: 'fuel-batches',
    label: 'Fuel batches',
    href: '/fuel-payments/batches',
    tileClass: 'bg-sky-700',
    matchPrefixes: ['/fuel-payments/batches']
  },
  {
    id: 'fuel-monthly',
    label: 'Fuel monthly report',
    href: '/fuel-payments/monthly-report',
    tileClass: 'bg-sky-600',
    matchPrefixes: ['/fuel-payments/monthly-report']
  },
  {
    id: 'shift-presets',
    label: 'Shift presets',
    href: '/roster/templates',
    tileClass: 'bg-cyan-700',
    matchPrefixes: ['/roster/templates']
  },
  {
    id: 'debit-scans',
    label: 'Debit scans',
    href: SCANS_MOBILE_PATH,
    tileClass: 'bg-red-600',
    matchPrefixes: [SCANS_MOBILE_PATH]
  },
  {
    id: 'roster-mobile',
    label: 'Roster (mobile)',
    href: ROSTER_MOBILE_PATH,
    tileClass: 'bg-emerald-700',
    matchPrefixes: [ROSTER_MOBILE_PATH]
  },
  {
    id: 'attendance-viewer',
    label: 'Attendance viewer',
    href: ATTENDANCE_VIEWER_PATH,
    tileClass: 'bg-indigo-800',
    matchPrefixes: [ATTENDANCE_VIEWER_PATH]
  },
  {
    id: 'manager-hub',
    label: 'Manager hub',
    href: MANAGER_HUB_PATH,
    tileClass: 'bg-slate-700',
    matchPrefixes: [MANAGER_HUB_PATH]
  },
  {
    id: 'expected-revenue',
    label: 'Expected revenue',
    href: '/insights/expected-revenue',
    tileClass: 'bg-blue-800',
    matchPrefixes: ['/insights/expected-revenue']
  },
  {
    id: 'deposit-scans',
    label: 'Deposit & debit scans',
    href: '/insights/deposit-debit-scans',
    tileClass: 'bg-blue-700',
    matchPrefixes: ['/insights/deposit-debit-scans']
  },
  {
    id: 'deposit-comparisons',
    label: 'Deposit comparisons',
    href: '/financial/deposit-comparisons',
    tileClass: 'bg-teal-700',
    matchPrefixes: ['/financial/deposit-comparisons']
  },
  {
    id: 'financial-report',
    label: 'Financial report',
    href: '/reports/financial',
    tileClass: 'bg-emerald-800',
    matchPrefixes: ['/reports/financial']
  },
  {
    id: 'monthly-report',
    label: 'Monthly report',
    href: '/reports/monthly',
    tileClass: 'bg-indigo-700',
    matchPrefixes: ['/reports/monthly']
  },
  {
    id: 'daily-summary',
    label: 'Daily financial summary',
    href: '/reports/daily-financial-summary',
    tileClass: 'bg-indigo-600',
    matchPrefixes: ['/reports/daily-financial-summary']
  },
  {
    id: 'fuel-payments',
    label: 'Fuel Payments',
    href: '/fuel-payments/invoices',
    tileClass: 'bg-blue-600',
    matchPrefixes: ['/fuel-payments']
  },
  {
    id: 'vendor-payments',
    label: 'Vendor Payments',
    href: '/vendor-payments/invoices',
    tileClass: 'bg-orange-600',
    matchPrefixes: ['/vendor-payments']
  },
  {
    id: 'end-of-day',
    label: 'End of Day',
    href: '/days',
    tileClass: 'bg-teal-600',
    matchPrefixes: ['/days']
  },
  {
    id: 'roster',
    label: 'Roster',
    href: '/roster',
    tileClass: 'bg-green-600',
    matchPrefixes: ['/roster']
  },
  {
    id: 'attendance',
    label: 'Attendance',
    href: '/attendance',
    tileClass: 'bg-indigo-600',
    matchPrefixes: ['/attendance']
  },
  {
    id: 'cashbook',
    label: 'Cashbook',
    href: '/financial/cashbook',
    tileClass: 'bg-slate-600',
    matchPrefixes: ['/financial/cashbook']
  },
  {
    id: 'customer-accounts',
    label: 'Customer accounts',
    href: '/customer-accounts',
    tileClass: 'bg-rose-700',
    matchPrefixes: ['/customer-accounts']
  },
  {
    id: 'shifts',
    label: 'Shifts',
    href: '/shifts',
    tileClass: 'bg-cyan-600',
    matchPrefixes: ['/shifts']
  },
  {
    id: 'staff',
    label: 'Staff',
    href: '/staff',
    tileClass: 'bg-slate-500',
    matchPrefixes: ['/staff']
  },
  {
    id: 'time-off',
    label: 'Time Off',
    href: '/time-off',
    tileClass: 'bg-teal-700',
    matchPrefixes: ['/time-off']
  },
  {
    id: 'applications',
    label: 'Applications',
    href: '/applications',
    tileClass: 'bg-fuchsia-700',
    matchPrefixes: ['/applications']
  },
  {
    id: 'reports-center',
    label: 'Reports Center',
    href: '/reports',
    tileClass: 'bg-yellow-600',
    matchPrefixes: ['/reports']
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    tileClass: 'bg-slate-500',
    matchPrefixes: ['/settings']
  }
]

export const DEFAULT_FAVORITE_IDS: HomeShortcutId[] = [
  'uncashed-checks',
  'pay-period',
  'fuel-batches',
  'debit-scans'
]

export const SUGGESTED_RECENT_IDS: HomeShortcutId[] = [
  'end-of-day',
  'uncashed-checks',
  'fuel-payments',
  'roster',
  'attendance',
  'cashbook'
]

const RECENT_KEY = 'shift-close-recent-shortcuts'
const FAVORITES_KEY = 'shift-close-favorite-shortcuts'
const MAX_RECENTS = 8

const SKIP_RECORD_PREFIXES = ['/login', '/forgot-password', '/reset-password', '/apply', '/dashboard']

export function shortcutById(id: string): HomeShortcut | undefined {
  return HOME_SHORTCUTS.find((s) => s.id === id)
}

export function shortcutForPath(pathname: string): HomeShortcut | null {
  let best: HomeShortcut | null = null
  let bestLen = -1
  for (const shortcut of HOME_SHORTCUTS) {
    for (const prefix of shortcut.matchPrefixes) {
      if (
        (pathname === prefix || pathname.startsWith(prefix + '/')) &&
        prefix.length > bestLen
      ) {
        best = shortcut
        bestLen = prefix.length
      }
    }
  }
  return best
}

export function shortcutVisibleForRole(href: string, role: string): boolean {
  const r = normalizeAppRole(role)
  if (href === MANAGER_HUB_PATH) return canAccessManagerHub(role)
  if (href === ATTENDANCE_VIEWER_PATH) return canAccessAttendanceViewer(role)
  if (href === ROSTER_MOBILE_PATH) return canAccessRosterMobile(role)
  if (href === SCANS_MOBILE_PATH) return canAccessScansMobile(role)
  if (r === 'admin' || r === 'manager') return true
  if (r === 'stakeholder') {
    return (
      href === '/dashboard' ||
      href.startsWith('/insights/') ||
      href === '/financial/deposit-comparisons' ||
      href === SCANS_MOBILE_PATH
    )
  }
  if (isSupervisorLike(role)) {
    const blocked = [
      '/financial',
      '/fuel-payments',
      '/vendor-payments',
      '/reports',
      '/settings',
      '/customer-accounts',
      '/roster/templates'
    ]
    return !blocked.some((b) => href.startsWith(b))
  }
  if (isOperationsManagerRole(role)) {
    return !isPathBlockedForOperationsManager(href)
  }
  return isFullAccessRole(role)
}

export function shortcutsVisibleForRole(role: string): HomeShortcut[] {
  return HOME_SHORTCUTS.filter((s) => shortcutVisibleForRole(s.href, role))
}

export function loadRecentShortcutIds(): HomeShortcutId[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((id): id is HomeShortcutId =>
      HOME_SHORTCUTS.some((s) => s.id === id)
    )
  } catch {
    return null
  }
}

export function loadFavoriteShortcutIds(): HomeShortcutId[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((id): id is HomeShortcutId =>
      HOME_SHORTCUTS.some((s) => s.id === id)
    )
  } catch {
    return null
  }
}

export function saveFavoriteShortcutIds(ids: HomeShortcutId[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids))
  } catch {
    // ignore
  }
}

export function recordShortcutVisit(pathname: string): void {
  if (typeof window === 'undefined') return
  if (SKIP_RECORD_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return
  const match = shortcutForPath(pathname)
  if (!match) return
  try {
    const current = loadRecentShortcutIds() ?? []
    const next = [match.id, ...current.filter((id) => id !== match.id)].slice(0, MAX_RECENTS)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function toggleFavoriteShortcut(id: HomeShortcutId): HomeShortcutId[] {
  const current = loadFavoriteShortcutIds() ?? [...DEFAULT_FAVORITE_IDS]
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
  saveFavoriteShortcutIds(next)
  return next
}

export function resolveShortcutRow(
  ids: HomeShortcutId[] | null,
  fallback: HomeShortcutId[],
  role: string,
  limit: number
): HomeShortcut[] {
  const visible = shortcutsVisibleForRole(role)
  const visibleIds = new Set(visible.map((s) => s.id))
  const source = ids && ids.length > 0 ? ids : fallback
  const picked = source.filter((id) => visibleIds.has(id))
  if (ids && ids.length > 0) {
    const ordered = picked
      .map((id) => visible.find((s) => s.id === id))
      .filter((s): s is HomeShortcut => Boolean(s))
    const seen = new Set(ordered.map((s) => s.id))
    const pad = fallback
      .filter((id) => visibleIds.has(id) && !seen.has(id))
      .map((id) => visible.find((s) => s.id === id))
      .filter((s): s is HomeShortcut => Boolean(s))
    return [...ordered, ...pad].slice(0, limit)
  }
  return fallback
    .filter((id) => visibleIds.has(id))
    .map((id) => visible.find((s) => s.id === id))
    .filter((s): s is HomeShortcut => Boolean(s))
    .slice(0, limit)
}
