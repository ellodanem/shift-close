'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

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
  if (href === '/attendance') return pathname.startsWith('/attendance')
  if (href === '/roster/templates') return pathname.startsWith('/roster/templates')
  if (href === '/settings') return pathname.startsWith('/settings')
  return pathname === href
}

export default function AppNav() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  })
  const [todayPayDays, setTodayPayDays] = useState<Array<{ id: string; date: string; notes: string | null }>>([])

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

  const sidebar = (
    <nav className={`flex flex-col h-full bg-gray-800 text-white shrink-0 transition-all duration-200 ease-in-out ${sidebarCollapsed ? 'w-16' : 'w-64'}`}>
      <div className={`border-b border-gray-700 min-h-[57px] flex items-center ${sidebarCollapsed ? 'flex-col justify-center gap-1 py-3 px-2' : 'flex-row justify-between px-4 py-4 gap-2'}`}>
        <Link href="/dashboard" className={`flex items-center min-w-0 ${sidebarCollapsed ? 'justify-center' : 'gap-2'}`}>
          {sidebarCollapsed ? (
            <span className="text-lg font-bold">SC</span>
          ) : (
            <span className="text-xl font-bold">Shift Close</span>
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
        <div className="px-3 py-2 bg-amber-600/90 text-white text-sm font-medium border-b border-amber-500/50">
          <span className="inline-block mr-1">💰</span>
          Today is Pay Day — Accounting will process payments
        </div>
      )}
      <div className={`flex-1 overflow-y-auto py-4 ${sidebarCollapsed ? 'hidden' : ''}`}>
        {navConfig.map((group) => (
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

      {/* Sidebar - hidden on mobile unless open */}
      <div
        className={`fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {sidebar}
      </div>
    </>
  )
}
