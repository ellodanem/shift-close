import { canAccessInsightsPages } from '@/lib/roles'

/** Canonical route for the mobile debit/deposit scan viewer. */
export const SCANS_MOBILE_PATH = '/scans/mobile'

export type ScanKind = 'deposit' | 'debit' | 'security'
export type ScanTypeFilter = ScanKind | 'all'

export function canAccessScansMobile(role: string): boolean {
  return canAccessInsightsPages(role)
}

export function isScansMobilePath(pathname: string): boolean {
  return pathname === SCANS_MOBILE_PATH
}
