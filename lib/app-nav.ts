import { ATTENDANCE_VIEWER_PATH, canAccessAttendanceViewer } from '@/lib/attendance-viewer'
import { MANAGER_HUB_PATH, canAccessManagerHub } from '@/lib/manager-hub'
import { ROSTER_MOBILE_PATH, canAccessRosterMobile } from '@/lib/roster-mobile'
import { SCANS_MOBILE_PATH, canAccessScansMobile } from '@/lib/scans-mobile'
import {
  HOME_SHORTCUTS,
  shortcutForPath,
  type HomeShortcut,
  type HomeShortcutId
} from '@/lib/home-shortcuts'
import {
  isOperationsManagerRole,
  isPathBlockedForOperationsManager,
  normalizeAppRole
} from '@/lib/roles'
import { filterSettingsNavItems } from '@/lib/settings-nav'
import { REPORTS_NAV_ITEMS } from '@/lib/reports-nav'

export type NavItemConfig = {
  label: string
  href: string
  permission: string
  comingSoon?: boolean
  children?: NavItemConfig[]
}

export type NavGroupConfig = {
  label: string
  items: NavItemConfig[]
}

export type NavTile = {
  label: string
  href: string
  shortcutId: HomeShortcutId
  tileClass: string
  comingSoon?: boolean
}

const BASE_NAV_CONFIG: NavGroupConfig[] = [
  {
    label: 'Home',
    items: [{ label: 'Home', href: '/dashboard', permission: 'dashboard' }]
  },
  {
    label: 'Operations',
    items: [
      { label: 'Shifts', href: '/shifts', permission: 'shifts' },
      { label: 'End of Day', href: '/days', permission: 'days' }
    ]
  },
  {
    label: 'Financial',
    items: [
      { label: 'Cashbook', href: '/financial/cashbook', permission: 'financial.cashbook' },
      {
        label: 'Deposit comparisons',
        href: '/financial/deposit-comparisons',
        permission: 'financial.depositComparisons'
      },
      { label: 'Customer Accounts', href: '/customer-accounts', permission: 'financial.accounts' },
      { label: 'Fuel Invoices', href: '/fuel-payments/invoices', permission: 'financial.fuel' },
      { label: 'Fuel Batches', href: '/fuel-payments/batches', permission: 'financial.fuel' },
      { label: 'Fuel Monthly', href: '/fuel-payments/monthly-report', permission: 'financial.fuel' },
      { label: 'Vendor Payments', href: '/vendor-payments/invoices', permission: 'financial.vendor' },
      { label: 'Vendor Batches', href: '/vendor-payments/batches', permission: 'financial.vendor' }
    ]
  },
  {
    label: 'Reports',
    items: []
  },
  {
    label: 'People',
    items: [
      { label: 'Staff', href: '/staff', permission: 'people.staff' },
      { label: 'Roster', href: '/roster', permission: 'people.roster' },
      { label: 'Attendance', href: '/attendance', permission: 'people.attendance' },
      { label: 'Time Off', href: '/time-off', permission: 'people.attendance' },
      { label: 'Applications', href: '/applications', permission: 'people.applications' }
    ]
  },
  {
    label: 'Promotions',
    items: [{ label: 'Promotions', href: '/promotions', permission: 'promotions' }]
  },
  {
    label: 'Mobile',
    items: [
      { label: 'Manager hub', href: MANAGER_HUB_PATH, permission: 'operations.managerHub' },
      { label: 'Roster (mobile)', href: ROSTER_MOBILE_PATH, permission: 'mobile.roster' },
      {
        label: 'Attendance viewer',
        href: ATTENDANCE_VIEWER_PATH,
        permission: 'mobile.attendanceViewer'
      },
      { label: 'Debit scans', href: SCANS_MOBILE_PATH, permission: 'mobile.scans' }
    ]
  },
  {
    label: 'Setup',
    items: []
  }
]

const HREF_SHORTCUT_OVERRIDES: Record<string, HomeShortcutId> = {
  '/days': 'end-of-day',
  '/fuel-payments/invoices': 'fuel-payments',
  '/fuel-payments/batches': 'fuel-batches',
  '/fuel-payments/monthly-report': 'fuel-monthly',
  '/vendor-payments/invoices': 'vendor-payments',
  '/vendor-payments/batches': 'vendor-batches',
  '/vendor-payments/uncashed-checks': 'uncashed-checks',
  '/insights/expected-revenue': 'expected-revenue',
  '/insights/deposit-debit-scans': 'deposit-scans',
  '/financial/deposit-comparisons': 'deposit-comparisons',
  '/promotions': 'promotions',
  '/settings/users': 'settings-users',
  '/settings/fuel-data': 'settings-fuel-data',
  '/settings/smtp': 'settings-smtp',
  '/settings/email-recipients': 'settings-email-recipients',
  '/settings/end-of-day-email': 'settings-end-of-day-email',
  '/settings/missing-deposit-slip-alerts': 'settings-missing-deposit-slip',
  '/settings/pay-days': 'settings-pay-days',
  '/settings/public-holidays': 'settings-public-holidays',
  '/settings/roster': 'settings-roster',
  '/settings/staff-roles': 'settings-staff-roles',
  '/settings/vendor-vat': 'settings-vendor-vat',
  '/settings/harvest-agent': 'settings-harvest-agent',
  '/roster/staff-report': 'report-staff-roster',
  '/reports/fuel-comparison': 'report-fuel-comparison',
  '/vendor-payments/monthly-report': 'report-vendor-invoices',
  '/reports/coming-soon/weekly': 'report-weekly',
  '/reports/coming-soon/supervisor': 'report-supervisor',
  '/reports/coming-soon/over-short': 'report-over-short',
  '/reports/coming-soon/deposit': 'report-deposit',
  '/reports/coming-soon/exception': 'report-exception'
}

const FALLBACK_TILE_CLASS = 'bg-slate-600'

function shortcutIdForHref(href: string): HomeShortcutId {
  if (HREF_SHORTCUT_OVERRIDES[href]) return HREF_SHORTCUT_OVERRIDES[href]
  const match = shortcutForPath(href)
  if (match) return match.id
  const byHref = HOME_SHORTCUTS.find((s) => s.href === href)
  if (byHref) return byHref.id
  return 'settings'
}

export function navItemToTile(item: NavItemConfig): NavTile {
  if (item.href === '/dashboard') {
    return {
      label: item.label,
      href: item.href,
      shortcutId: 'settings',
      tileClass: 'bg-blue-900'
    }
  }
  const shortcutId = shortcutIdForHref(item.href)
  const shortcut = HOME_SHORTCUTS.find((s) => s.id === shortcutId)
  return {
    label: item.label,
    href: item.href,
    shortcutId,
    tileClass: shortcut?.tileClass ?? FALLBACK_TILE_CLASS,
    comingSoon: item.comingSoon
  }
}

export function flattenNavItems(items: NavItemConfig[]): NavItemConfig[] {
  return items.flatMap((item) => {
    if (item.children?.length) {
      return [item, ...item.children]
    }
    return [item]
  })
}

export function navItemVisibleForRole(href: string, role: string): boolean {
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
      href === '/financial/deposit-comparisons'
    )
  }
  if (r === 'supervisor' || r === 'senior_supervisor') {
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
  return true
}

function buildReportsNavItems(role: string, includeComingSoon: boolean): NavItemConfig[] {
  return REPORTS_NAV_ITEMS.filter((item) => {
    if (item.comingSoon) return includeComingSoon
    return navItemVisibleForRole(item.href, role)
  }).map((item) => ({
    label: item.label,
    href: item.href,
    permission: item.permission,
    comingSoon: item.comingSoon
  }))
}

export function buildReportsCenterTiles(role: string): NavTile[] {
  return buildReportsNavItems(role, true).map(navItemToTile)
}

function filterNavItems(items: NavItemConfig[], role: string): NavItemConfig[] {
  return items
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => navItemVisibleForRole(child.href, role))
    }))
    .filter(
      (item) =>
        navItemVisibleForRole(item.href, role) || (item.children != null && item.children.length > 0)
    )
    .map((item) => ({
      ...item,
      children: item.children?.length ? item.children : undefined
    }))
}

export function isPathActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/shifts') return pathname === '/shifts' || pathname.startsWith('/shifts/')
  if (href === '/days') return pathname === '/days'
  if (href === '/financial/cashbook') return pathname.startsWith('/financial/cashbook')
  if (href === '/financial/deposit-comparisons') return pathname.startsWith('/financial/deposit-comparisons')
  if (href === '/reports/financial') return pathname.startsWith('/reports/financial')
  if (href === '/reports/fuel-comparison') return pathname.startsWith('/reports/fuel-comparison')
  if (href === '/vendor-payments/monthly-report') {
    return pathname.startsWith('/vendor-payments/monthly-report')
  }
  if (href === '/attendance/late-absent') return pathname.startsWith('/attendance/late-absent')
  if (href === '/attendance/pay-period') return pathname.startsWith('/attendance/pay-period')
  if (href === '/customer-accounts') return pathname.startsWith('/customer-accounts')
  if (href === '/fuel-payments/invoices') {
    return pathname === '/fuel-payments/invoices' || pathname.startsWith('/fuel-payments/invoices/')
  }
  if (href === '/fuel-payments/batches') return pathname.startsWith('/fuel-payments/batches')
  if (href === '/fuel-payments/monthly-report') return pathname.startsWith('/fuel-payments/monthly-report')
  if (href === '/fuel-payments') return pathname.startsWith('/fuel-payments')
  if (href === '/vendor-payments/batches') return pathname.startsWith('/vendor-payments/batches')
  if (href === '/vendor-payments/invoices') {
    return pathname === '/vendor-payments/invoices' || pathname.startsWith('/vendor-payments/invoices/')
  }
  if (href === '/vendor-payments/uncashed-checks') {
    return pathname.startsWith('/vendor-payments/uncashed-checks')
  }
  if (href === '/vendor-payments') return pathname.startsWith('/vendor-payments')
  if (href === '/reports') return pathname === '/reports'
  if (href === '/reports/monthly') return pathname.startsWith('/reports/monthly')
  if (href === '/reports/daily-financial-summary') return pathname.startsWith('/reports/daily-financial-summary')
  if (href === '/staff') return pathname === '/staff' || pathname.startsWith('/staff/')
  if (href === '/roster/staff-report') return pathname.startsWith('/roster/staff-report')
  if (href === '/roster') {
    if (pathname === ROSTER_MOBILE_PATH) return false
    return pathname === '/roster'
  }
  if (href === '/applications') return pathname.startsWith('/applications')
  if (href === '/attendance/settings') {
    return pathname === '/attendance/settings' || pathname.startsWith('/attendance/settings/')
  }
  if (href === MANAGER_HUB_PATH) return pathname === MANAGER_HUB_PATH
  if (href === ATTENDANCE_VIEWER_PATH) return pathname === ATTENDANCE_VIEWER_PATH
  if (href === ROSTER_MOBILE_PATH) return pathname === ROSTER_MOBILE_PATH
  if (href === SCANS_MOBILE_PATH) return pathname === SCANS_MOBILE_PATH
  if (href === '/time-off') return pathname === '/time-off' || pathname.startsWith('/time-off/')
  if (href === '/call-outs') return pathname === '/call-outs' || pathname.startsWith('/call-outs/')
  if (href === '/attendance') {
    if (pathname === '/attendance/settings' || pathname.startsWith('/attendance/settings/')) return false
    if (pathname === ATTENDANCE_VIEWER_PATH) return false
    return pathname.startsWith('/attendance')
  }
  if (href === '/roster/templates') return pathname.startsWith('/roster/templates')
  if (href === '/settings/users') return pathname.startsWith('/settings/users')
  if (href === '/settings/fuel-data') return pathname.startsWith('/settings/fuel-data')
  if (href === '/settings/smtp') return pathname.startsWith('/settings/smtp')
  if (href === '/settings/email-recipients') return pathname.startsWith('/settings/email-recipients')
  if (href === '/settings/end-of-day-email') return pathname.startsWith('/settings/end-of-day-email')
  if (href === '/settings/missing-deposit-slip-alerts') {
    return pathname.startsWith('/settings/missing-deposit-slip-alerts')
  }
  if (href === '/settings/pay-days') return pathname.startsWith('/settings/pay-days')
  if (href === '/settings/public-holidays') return pathname.startsWith('/settings/public-holidays')
  if (href === '/settings/roster') return pathname.startsWith('/settings/roster')
  if (href === '/settings/staff-roles') return pathname.startsWith('/settings/staff-roles')
  if (href === '/settings/vendor-vat') return pathname.startsWith('/settings/vendor-vat')
  if (href === '/settings/harvest-agent') return pathname.startsWith('/settings/harvest-agent')
  if (href === '/settings') return pathname === '/settings'
  if (href === '/insights/expected-revenue') return pathname.startsWith('/insights/expected-revenue')
  if (href === '/insights/deposit-debit-scans') return pathname.startsWith('/insights/deposit-debit-scans')
  if (href === '/promotions') return pathname === '/promotions' || pathname.startsWith('/promotions/')
  return pathname === href
}

export function isGroupActive(group: NavGroupConfig, pathname: string): boolean {
  if (group.label === 'Setup' && pathname === '/settings') return true
  if (group.label === 'Reports' && pathname === '/reports') return true
  return flattenNavItems(group.items).some((item) => isPathActive(pathname, item.href))
}

export function buildFilteredNavGroups(role: string): NavGroupConfig[] {
  const nr = normalizeAppRole(role)
  const groups = BASE_NAV_CONFIG.map((group) => {
    if (group.label === 'Setup') {
      return {
        ...group,
        items: filterSettingsNavItems(role).map((item) => ({
          label: item.label,
          href: item.href,
          permission: item.permission
        }))
      }
    }
    if (group.label === 'Reports') {
      return {
        ...group,
        items: buildReportsNavItems(role, false)
      }
    }
    return {
      ...group,
      items: filterNavItems(group.items, role)
    }
  }).filter((g) => g.items.length > 0)

  if (nr === 'stakeholder' || nr === 'admin' || nr === 'manager' || isOperationsManagerRole(role)) {
    const insightsItems = filterNavItems(
      [
        { label: 'Expected revenue', href: '/insights/expected-revenue', permission: 'insights' },
        { label: 'Deposit & debit scans', href: '/insights/deposit-debit-scans', permission: 'insights' },
        {
          label: 'Deposit comparisons',
          href: '/financial/deposit-comparisons',
          permission: 'financial.depositComparisons'
        }
      ],
      role
    )
    if (insightsItems.length > 0) {
      const opsIdx = groups.findIndex((g) => g.label === 'Operations')
      const insertAt = opsIdx >= 0 ? opsIdx + 1 : 1
      groups.splice(insertAt, 0, {
        label: 'Insights',
        items: insightsItems
      })
    }
  }

  return groups
}

export function navGroupByLabel(groups: NavGroupConfig[], label: string): NavGroupConfig | undefined {
  return groups.find((g) => g.label === label)
}

export function navTilesForGroup(group: NavGroupConfig): NavTile[] {
  return flattenNavItems(group.items).map(navItemToTile)
}

export function groupUsesTilePicker(group: NavGroupConfig): boolean {
  return flattenNavItems(group.items).length > 1
}

/** Icon key per nav group — used by sidebar group rows. */
export const NAV_GROUP_ICON: Record<string, string> = {
  Home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  Operations:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  Insights: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  Financial:
    'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  Reports:
    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  People:
    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  Promotions:
    'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
  Mobile:
    'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  Setup:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z'
}

export type { HomeShortcut }
