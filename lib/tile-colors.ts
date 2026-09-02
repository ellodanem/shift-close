import type { HomeShortcutId } from '@/lib/home-shortcuts'

/** Hex backgrounds for shortcut/nav tiles — not dependent on Tailwind purge. */
export const SHORTCUT_TILE_BG: Record<HomeShortcutId, string> = {
  'pay-period': '#7c3aed',
  'late-absent': '#b45309',
  'uncashed-checks': '#f59e0b',
  'fuel-batches': '#0369a1',
  'fuel-monthly': '#0284c7',
  'shift-presets': '#0e7490',
  'debit-scans': '#dc2626',
  'roster-mobile': '#047857',
  'attendance-viewer': '#3730a3',
  'manager-hub': '#334155',
  'expected-revenue': '#1e40af',
  'deposit-scans': '#1d4ed8',
  'deposit-comparisons': '#0f766e',
  'financial-report': '#065f46',
  'monthly-report': '#4338ca',
  'daily-summary': '#4f46e5',
  'fuel-payments': '#2563eb',
  'vendor-payments': '#ea580c',
  'end-of-day': '#0d9488',
  roster: '#16a34a',
  attendance: '#4f46e5',
  cashbook: '#475569',
  'customer-accounts': '#be123c',
  shifts: '#0891b2',
  staff: '#64748b',
  'time-off': '#0f766e',
  applications: '#a21caf',
  'reports-center': '#ca8a04',
  settings: '#64748b'
}

const HREF_TILE_BG: Record<string, string> = {
  '/dashboard': '#1e3a8a'
}

export function tileBackgroundColor(href: string, shortcutId: HomeShortcutId): string {
  if (HREF_TILE_BG[href]) return HREF_TILE_BG[href]
  return SHORTCUT_TILE_BG[shortcutId] ?? '#475569'
}
