import type { HomeShortcutId } from '@/lib/home-shortcuts'
import { canManageAppUsers } from '@/lib/roles'

export type SettingsNavItemConfig = {
  label: string
  href: string
  shortcutId: HomeShortcutId
  permission: string
}

export const SETTINGS_NAV_ITEMS: SettingsNavItemConfig[] = [
  {
    label: 'User accounts',
    href: '/settings/users',
    shortcutId: 'settings-users',
    permission: 'settings.users'
  },
  {
    label: 'Fuel data',
    href: '/settings/fuel-data',
    shortcutId: 'settings-fuel-data',
    permission: 'settings'
  },
  {
    label: 'Email (SMTP)',
    href: '/settings/smtp',
    shortcutId: 'settings-smtp',
    permission: 'settings'
  },
  {
    label: 'Email recipients',
    href: '/settings/email-recipients',
    shortcutId: 'settings-email-recipients',
    permission: 'settings'
  },
  {
    label: 'End of day email',
    href: '/settings/end-of-day-email',
    shortcutId: 'settings-end-of-day-email',
    permission: 'settings'
  },
  {
    label: 'Missing deposit slips',
    href: '/settings/missing-deposit-slip-alerts',
    shortcutId: 'settings-missing-deposit-slip',
    permission: 'settings'
  },
  {
    label: 'Pay days',
    href: '/settings/pay-days',
    shortcutId: 'settings-pay-days',
    permission: 'settings'
  },
  {
    label: 'Public holidays',
    href: '/settings/public-holidays',
    shortcutId: 'settings-public-holidays',
    permission: 'settings'
  },
  {
    label: 'Roster rules',
    href: '/settings/roster',
    shortcutId: 'settings-roster',
    permission: 'settings'
  },
  {
    label: 'Staff roles',
    href: '/settings/staff-roles',
    shortcutId: 'settings-staff-roles',
    permission: 'settings'
  },
  {
    label: 'Vendor VAT',
    href: '/settings/vendor-vat',
    shortcutId: 'settings-vendor-vat',
    permission: 'settings'
  },
  {
    label: 'Harvest agent',
    href: '/settings/harvest-agent',
    shortcutId: 'settings-harvest-agent',
    permission: 'settings'
  }
]

export function filterSettingsNavItems(role: string): SettingsNavItemConfig[] {
  return SETTINGS_NAV_ITEMS.filter((item) => {
    if (item.href === '/settings/users') return canManageAppUsers(role)
    return true
  })
}
