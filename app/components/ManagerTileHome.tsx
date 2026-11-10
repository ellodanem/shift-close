'use client'

import { CategorizedTiles, type StakeholderCategory } from './StakeholderTileHome'

/**
 * Manager home tiles: same layout as the stakeholder home, End of Day first, nothing greyed out.
 * Revert point: git tag pre-manager-tile-dashboard.
 */
const CATEGORIES: StakeholderCategory[] = [
  {
    title: 'End of Day',
    tiles: [{ label: 'End of Day', href: '/days', iconId: 'end-of-day' }]
  },
  {
    title: 'Operations',
    tiles: [
      { label: 'Shifts', href: '/shifts', iconId: 'shifts' },
      { label: 'Roster', href: '/roster', iconId: 'roster' },
      { label: 'Attendance', href: '/attendance', iconId: 'attendance' },
      { label: 'Time Off', href: '/time-off', iconId: 'time-off' }
    ]
  },
  {
    title: 'Insights',
    tiles: [
      { label: 'Fuel expectancy', href: '/insights/fuel-expectancy', iconId: 'fuel-expectancy' },
      { label: 'Expected revenue', href: '/insights/expected-revenue', iconId: 'expected-revenue' },
      { label: 'Deposit & debit scans', href: '/insights/deposit-debit-scans', iconId: 'deposit-scans' },
      { label: 'Deposit comparisons', href: '/financial/deposit-comparisons', iconId: 'deposit-comparisons' },
      { label: 'Fuel comparison', href: '/reports/fuel-comparison', iconId: 'report-fuel-comparison' }
    ]
  },
  {
    title: 'People',
    tiles: [
      { label: 'Staff', href: '/staff', iconId: 'staff' },
      { label: 'Payroll', href: '/payroll', iconId: 'pay-run' },
      { label: 'Applications', href: '/applications', iconId: 'applications' }
    ]
  },
  {
    title: 'Financial',
    tiles: [
      { label: 'Cashbook', href: '/financial/cashbook', iconId: 'cashbook' },
      { label: 'Customer accounts', href: '/customer-accounts', iconId: 'customer-accounts' },
      { label: 'Accounting', href: '/accounting', iconId: 'financial-report', colorId: 'cashbook' },
      { label: 'Fuel Payments', href: '/fuel-payments/invoices', iconId: 'fuel-payments' },
      { label: 'Vendor Payments', href: '/vendor-payments/invoices', iconId: 'vendor-payments' },
      { label: 'Check Management', href: '/vendor-payments/uncashed-checks', iconId: 'uncashed-checks' }
    ]
  }
]

export default function ManagerTileHome() {
  return <CategorizedTiles categories={CATEGORIES} />
}
