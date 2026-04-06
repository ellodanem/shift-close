import type { NextRequest } from 'next/server'
import {
  isFullAccessRole,
  isOperationsManagerRole,
  isPathBlockedForOperationsManager,
  isSupervisorLike,
  normalizeAppRole
} from '@/lib/roles'

/** Paths that never require auth */
export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/iclock')) return true
  if (pathname === '/favicon.ico') return true
  if (pathname.startsWith('/apply')) return true
  if (pathname === '/login' || pathname === '/reset-password' || pathname === '/forgot-password') return true
  if (
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/forgot-password' ||
    pathname === '/api/auth/reset-password'
  ) {
    return true
  }
  if (pathname.startsWith('/api/attendance/adms')) return true
  if (pathname === '/api/attendance/ingest') return true
  // Cron jobs validate CRON_SECRET inside the route (see route handler).
  if (pathname === '/api/cron/end-of-day-email') return true
  if (pathname === '/api/cron/present-absence-notify') return true
  return false
}

/** After auth: can this role access this pathname (page or API)? */
export function pathnameAllowedForRole(pathname: string, role: string): boolean {
  if (isFullAccessRole(role)) return true

  if (normalizeAppRole(role) === 'stakeholder') {
    if (pathname.startsWith('/api/')) {
      return (
        pathname.startsWith('/api/auth/') ||
        pathname.startsWith('/api/insights/') ||
        pathname.startsWith('/api/dashboard/month-summary') ||
        pathname.startsWith('/api/dashboard/fuel-mtd-sold') ||
        pathname.startsWith('/api/dashboard/average-deposit') ||
        pathname.startsWith('/api/dashboard/fuel-comparison') ||
        pathname.startsWith('/api/dashboard/upcoming') ||
        pathname.startsWith('/api/dashboard/today') ||
        pathname.startsWith('/api/attendance/present-absence') ||
        pathname.startsWith('/api/pay-days') ||
        pathname.startsWith('/api/fuel-payments/recent') ||
        pathname.startsWith('/api/financial/deposit-comparisons')
      )
    }
    return (
      pathname === '/dashboard' ||
      pathname.startsWith('/dashboard/present-absence') ||
      pathname.startsWith('/insights/') ||
      pathname.startsWith('/financial/deposit-comparisons')
    )
  }

  if (isSupervisorLike(role)) {
    const blockedPrefixes = [
      '/financial',
      '/fuel-payments',
      '/vendor-payments',
      '/reports',
      '/settings',
      '/customer-accounts',
      '/account-customers',
      '/roster/templates'
    ]
    if (blockedPrefixes.some((p) => pathname.startsWith(p))) return false
    if (pathname.startsWith('/api/financial')) return false
    if (pathname.startsWith('/api/fuel-payments')) return false
    if (pathname.startsWith('/api/vendor-payments')) return false
    if (pathname.startsWith('/api/reports/')) return false
    if (pathname.startsWith('/api/settings')) return false
    if (pathname.startsWith('/api/customer-accounts')) return false
    if (pathname.startsWith('/api/account-customers')) return false
    return true
  }

  if (isOperationsManagerRole(role)) {
    return !isPathBlockedForOperationsManager(pathname)
  }

  return true
}

export function apiWriteAllowedForRole(
  request: NextRequest,
  pathname: string,
  role: string
): boolean {
  const method = request.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return pathnameAllowedForRole(pathname, role)
  }
  if (isFullAccessRole(role)) return true
  if (normalizeAppRole(role) === 'stakeholder') {
    return (
      pathname.startsWith('/api/auth/') ||
      pathname.startsWith('/api/insights/') ||
      pathname.startsWith('/api/financial/deposit-comparisons')
    )
  }
  if (isSupervisorLike(role)) {
    if (pathname.startsWith('/api/roster/weeks') && method === 'POST') return false
    if (pathname.startsWith('/api/roster/templates') && method !== 'GET') return false
    if (pathname.startsWith('/api/roster/send-whatsapp')) return false
    if (pathname.startsWith('/api/users')) return false
    if (pathname.startsWith('/api/settings') && method !== 'GET') return false
    return pathnameAllowedForRole(pathname, role)
  }
  return true
}
