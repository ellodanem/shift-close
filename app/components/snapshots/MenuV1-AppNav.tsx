'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import FutureFeatures from '../FutureFeatures'
import { useAuth } from '../AuthContext'
import {
  formatAppUserDisplayName,
  isOperationsManagerRole,
  isPathBlockedForOperationsManager,
  normalizeAppRole
} from '@/lib/roles'

const SIDEBAR_COLLAPSED_KEY = 'shift-close-sidebar-collapsed'

// Nav config - permission-ready for future role-based access
const navConfig = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', href: '/dashboard', permission: 'dashboard' },
      { label: 'Shifts', href: '/shifts', permission: 'shifts' },
      { label: 'End of Day', href: '/days', permission: 'days' },
    ],
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
      { label: 'Financial Report', href: '/reports/financial', permission: 'financial.report' },
      { label: 'Customer Accounts', href: '/customer-accounts', permission: 'financial.accounts' },
      { label: 'Account Balances', href: '/account-customers', permission: 'financial.accounts' },
      { label: 'Fuel Payments', href: '/fuel-payments', permission: 'financial.fuel' },
      { label: 'Vendor Payments', href: '/vendor-payments', permission: 'financial.vendor' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Reports Center', href: '/reports', permission: 'reports.center' },
      { label: 'Monthly Report', href: '/reports/monthly', permission: 'reports.monthly' },
      { label: 'Daily Financial Summary', href: '/reports/daily-financial-summary', permission: 'reports.daily' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Staff', href: '/staff', permission: 'people.staff' },
      { label: 'Roster', href: '/roster', permission: 'people.roster' },
      { label: 'Attendance', href: '/attendance', permission: 'people.attendance' },
      { label: 'Shift Presets', href: '/roster/templates', permission: 'people.roster' },
      { label: 'Applications', href: '/applications', permission: 'people.applications' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Settings', href: '/settings', permission: 'settings' },
    ],
  },
]

function NavLink({
  href,
  label,
  isActive,
}: {
  href: string
  label: string
  isActive: boolean
}) {
  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? 'bg-gray-700 text-white'
          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {label}
    </Link>
  )
}

function isPathActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/shifts') return pathname === '/shifts' || pathname.startsWith('/shifts/')
  if (href === '/days') return pathname === '/days'
  if (href === '/financial/cashbook') return pathname.startsWith('/financial/cashbook')
  if (href === '/financial/deposit-comparisons') return pathname.startsWith('/financial/deposit-comparisons')
  if (href === '/reports/financial') return pathname === '/reports/financial'
  if (href === '/customer-accounts') return pathname.startsWith('/customer-accounts')
  if (href === '/account-customers') return pathname.startsWith('/account-customers')
  if (href === '/fuel-payments') return pathname.startsWith('/fuel-payments')
  if (href === '/vendor-payments') return pathname.startsWith('/vendor-payments')
  if (href === '/reports') return pathname === '/reports'
  if (href === '/reports/monthly') return pathname.startsWith('/reports/monthly')
  if (href === '/reports/daily-financial-summary') return pathname.startsWith('/reports/daily-financial-summary')
  if (href === '/staff') return pathname === '/staff' || pathname.startsWith('/staff/')
  if (href === '/roster') return pathname === '/roster'
  if (href === '/applications') return pathname.startsWith('/applications')
  if (href === '/attendance/settings') {
    return pathname === '/attendance/settings' || pathname.startsWith('/attendance/settings/')
  }
  if (href === '/attendance') {
    if (pathname === '/attendance/settings' || pathname.startsWith('/attendance/settings/')) return false
    return pathname.startsWith('/attendance')
  }
  if (href === '/roster/templates') return pathname.startsWith('/roster/templates')
  if (href === '/settings') return pathname.startsWith('/settings')
  if (href === '/insights/expected-revenue') return pathname.startsWith('/insights/expected-revenue')
  if (href === '/insights/deposit-debit-scans') return pathname.startsWith('/insights/deposit-debit-scans')
  return pathname === href
}

function navItemVisibleForRole(href: string, role: string): boolean {
  const r = normalizeAppRole(role)
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
      '/account-customers',
      '/roster/templates'
    ]
    return !blocked.some((b) => href.startsWith(b))
  }
  if (isOperationsManagerRole(role)) {
    return !isPathBlockedForOperationsManager(href)
  }
  return true
}

export default function AppNav() {
  const pathname = usePathname()
  const { user, logout, canManageUsers } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  /** Must match SSR (false) on first paint — reading localStorage in useState breaks hydration. */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true') {
        setSidebarCollapsed(true)
      }
    } catch {
      // ignore
    }
  }, [])
  const [todayPayDays, setTodayPayDays] = useState<Array<{ id: string; date: string; notes: string | null }>>([])
  const [showFeaturesModal, setShowFeaturesModal] = useState(false)

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      }
      return next
    })
  }

  useEffect(() => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const todayStr = `${y}-${m}-${d}`
    fetch(`/api/pay-days?date=${todayStr}`)
      .then((res) => res.json())
      .then((data) => setTodayPayDays(Array.isArray(data) ? data : []))
      .catch(() => setTodayPayDays([]))
  }, [])

  const role = user?.role ?? ''

  const filteredNav = useMemo(() => {
    const nr = normalizeAppRole(role)
    const groups = navConfig
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => navItemVisibleForRole(item.href, role))
      }))
      .filter((g) => g.items.length > 0)

    if (nr === 'stakeholder' || nr === 'admin' || nr === 'manager' || isOperationsManagerRole(role)) {
      groups.splice(1, 0, {
        label: 'Insights',
        items: [
          { label: 'Expected revenue', href: '/insights/expected-revenue', permission: 'insights' },
          { label: 'Deposit & debit scans', href: '/insights/deposit-debit-scans', permission: 'insights' }
        ]
      })
    }

    if (canManageUsers) {
      const si = groups.findIndex((g) => g.label === 'Settings')
      if (si >= 0) {
        groups[si] = {
          ...groups[si],
          items: [
            ...groups[si].items,
            { label: 'User accounts', href: '/settings/users', permission: 'settings.users' }
          ]
        }
      }
    }

    return groups
  }, [role, canManageUsers])

  const sidebar = (
    <nav className={`flex flex-col h-full min-h-0 bg-gray-800 text-white shrink-0 transition-all duration-200 ease-in-out ${sidebarCollapsed ? 'w-16' : 'w-64'}`}>
      <div className={`border-b border-gray-700 min-h-[57px] flex-shrink-0 flex items-center ${sidebarCollapsed ? 'flex-col justify-center gap-1 py-3 px-2' : 'flex-row justify-between px-4 py-4 gap-2'}`}>
        <Link href="/dashboard" className={`flex items-center min-w-0 ${sidebarCollapsed ? 'justify-center' : 'gap-2'}`}>
          {sidebarCollapsed ? (
            <span className="text-lg font-bold">SC</span>
          ) : (
            <Image
              src="/shift-close-logo.png"
              alt="Shift Close"
              width={180}
              height={100}
              priority
              unoptimized
              className="h-auto w-36 max-w-full"
            />
          )}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex-shrink-0"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>
      {!sidebarCollapsed && todayPayDays.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2 bg-amber-600/90 text-white text-sm font-medium border-b border-amber-500/50">
          <span className="inline-block mr-1">💰</span>
          Today is Pay Day — Accounting will process payments
        </div>
      )}
      <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 scrollbar-subtle ${sidebarCollapsed ? 'hidden' : ''}`}>
        {filteredNav.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {group.label}
            </div>
            <div className="space-y-0.5 px-3">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  isActive={isPathActive(pathname, item.href)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {!sidebarCollapsed && user && (
        <div className="flex-shrink-0 border-t border-gray-700 px-3 py-2 text-xs text-gray-400 truncate" title={user.email}>
          {formatAppUserDisplayName(user)}
          <span className="block text-[10px] text-gray-500 capitalize">{user.role.replace(/_/g, ' ')}</span>
        </div>
      )}
      <div className={`flex-shrink-0 border-t border-gray-700 p-2 flex gap-1 ${sidebarCollapsed ? 'flex-col items-center' : 'justify-between items-center'}`}>
        <button
          type="button"
          onClick={() => setShowFeaturesModal(true)}
          className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="View planned features"
          aria-label="View planned features"
        >
          <span className="text-xl">ℹ️</span>
        </button>
        {user && (
          <button
            type="button"
            onClick={() => void logout()}
            className={`rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors ${
              sidebarCollapsed ? 'p-2' : 'text-xs px-2 py-1'
            }`}
            title="Log out"
            aria-label="Log out"
          >
            {sidebarCollapsed ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            ) : (
              'Log out'
            )}
          </button>
        )}
      </div>
    </nav>
  )

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-gray-800 text-white shadow-lg"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {mobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - hidden on mobile unless open; min-h-screen fills page, stretches with content */}
      <div
        className={`fixed lg:static inset-y-0 left-0 z-40 min-h-screen flex flex-col transform transition-transform duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {sidebar}
      </div>
      <FutureFeatures open={showFeaturesModal} onClose={() => setShowFeaturesModal(false)} />
    </>
  )
}
