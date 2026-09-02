import type { HomeShortcutId } from '@/lib/home-shortcuts'

export type ReportsNavItemConfig = {
  label: string
  href: string
  shortcutId: HomeShortcutId
  permission: string
  comingSoon?: boolean
}

export const REPORTS_NAV_ITEMS: ReportsNavItemConfig[] = [
  {
    label: 'Staff roster',
    href: '/roster/staff-report',
    shortcutId: 'report-staff-roster',
    permission: 'reports.center'
  },
  {
    label: 'Late & absent',
    href: '/attendance/late-absent',
    shortcutId: 'late-absent',
    permission: 'reports.center'
  },
  {
    label: 'Weekly',
    href: '/reports/coming-soon/weekly',
    shortcutId: 'report-weekly',
    permission: 'reports.center',
    comingSoon: true
  },
  {
    label: 'Monthly',
    href: '/reports/monthly',
    shortcutId: 'monthly-report',
    permission: 'reports.center'
  },
  {
    label: 'Financial',
    href: '/reports/financial',
    shortcutId: 'financial-report',
    permission: 'reports.center'
  },
  {
    label: 'Supervisor',
    href: '/reports/coming-soon/supervisor',
    shortcutId: 'report-supervisor',
    permission: 'reports.center',
    comingSoon: true
  },
  {
    label: 'Over/short',
    href: '/reports/coming-soon/over-short',
    shortcutId: 'report-over-short',
    permission: 'reports.center',
    comingSoon: true
  },
  {
    label: 'Daily summary',
    href: '/reports/daily-financial-summary',
    shortcutId: 'daily-summary',
    permission: 'reports.center'
  },
  {
    label: 'Fuel comparison',
    href: '/reports/fuel-comparison',
    shortcutId: 'report-fuel-comparison',
    permission: 'reports.center'
  },
  {
    label: 'All invoices',
    href: '/vendor-payments/monthly-report',
    shortcutId: 'report-vendor-invoices',
    permission: 'reports.center'
  },
  {
    label: 'Fuel monthly',
    href: '/fuel-payments/monthly-report',
    shortcutId: 'fuel-monthly',
    permission: 'reports.center'
  },
  {
    label: 'Pay period',
    href: '/attendance/pay-period',
    shortcutId: 'pay-period',
    permission: 'reports.center'
  },
  {
    label: 'Deposit',
    href: '/reports/coming-soon/deposit',
    shortcutId: 'report-deposit',
    permission: 'reports.center',
    comingSoon: true
  },
  {
    label: 'Exception',
    href: '/reports/coming-soon/exception',
    shortcutId: 'report-exception',
    permission: 'reports.center',
    comingSoon: true
  },
  {
    label: 'End of day',
    href: '/days',
    shortcutId: 'end-of-day',
    permission: 'reports.center'
  }
]
