'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import AppNav from './AppNav'
import AppUtilityBar from './AppUtilityBar'
import NavPickerPanel from './NavPickerPanel'
import { NavProvider } from './NavContext'
import { useAuth } from './AuthContext'
import {
  ATTENDANCE_VIEWER_PATH,
  ATTENDANCE_VIEWER_PAY_PERIOD_PATH
} from '@/lib/attendance-viewer'
import { MANAGER_HUB_PATH } from '@/lib/manager-hub'
import { ROSTER_MOBILE_PATH } from '@/lib/roster-mobile'
import { SCANS_MOBILE_PATH } from '@/lib/scans-mobile'
import OperationsChecklistPanel from './OperationsChecklistPanel'
import RentDueBanner from './RentDueBanner'
import { recordShortcutVisit } from '@/lib/home-shortcuts'

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const isApplyRoute = pathname?.startsWith('/apply')
  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/reset-password' ||
    pathname === '/forgot-password'
  const isMinimalMobileShell =
    pathname === ATTENDANCE_VIEWER_PATH ||
    pathname === ATTENDANCE_VIEWER_PAY_PERIOD_PATH ||
    pathname === ROSTER_MOBILE_PATH ||
    pathname === SCANS_MOBILE_PATH ||
    pathname === MANAGER_HUB_PATH

  useEffect(() => {
    if (!pathname || isApplyRoute || isAuthRoute || isMinimalMobileShell) return
    if (!user) return
    recordShortcutVisit(pathname)
    window.dispatchEvent(new Event('shift-close-shortcuts-changed'))
  }, [pathname, user, isApplyRoute, isAuthRoute, isMinimalMobileShell])

  if (isApplyRoute || isAuthRoute || isMinimalMobileShell) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-gray-50">
      <AppNav />
      <div className="flex min-h-0 flex-1 flex-col min-w-0 pt-14 pl-14 lg:pt-0 lg:pl-0">
        <RentDueBanner />
        {!loading && user ? <AppUtilityBar /> : null}
        <main className="relative min-h-0 flex-1 min-w-0 overflow-y-auto">
          <NavPickerPanel />
          {children}
        </main>
        <OperationsChecklistPanel />
      </div>
    </div>
  )
}

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NavProvider>
      <AppShell>{children}</AppShell>
    </NavProvider>
  )
}
