import type { NextRequest } from 'next/server'
import { isFullAccessRole, isSupervisorLike, normalizeAppRole } from '@/lib/roles'

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
  return false
}

/** After auth: can this role access this pathname (page or API)? */
export function pathnameAllowedForRole(pathname: string, role: string): boolean {
  if (isFullAccessRole(role)) return true

  if (normalizeAppRole(role) === 'stakeholder') {
    if (pathname.startsWith('/api/')) {
      return (
        pathname.startsWith('/api/auth/') ||
        pathname.startsWith('/api/overseer/') ||
        pathname.startsWith('/api/dashboard/month-summary') ||
        pathname.startsWith('/api/dashboard/upcoming') ||
        pathname.startsWith('/api/dashboard/today') ||
        pathname.startsWith('/api/pay-days')
      )
    }
    return pathname === '/dashboard' || pathname.startsWith('/overseer/')
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
    return pathname.startsWith('/api/auth/') || pathname.startsWith('/api/overseer/')
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
