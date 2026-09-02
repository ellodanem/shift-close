'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback } from 'react'
import FutureFeatures from './FutureFeatures'
import { useAuth } from './AuthContext'
import { useNav } from './NavContext'
import NavGroupTiles from './NavGroupTiles'
import {
  NAV_GROUP_ICON,
  buildFilteredNavGroups,
  flattenNavItems,
  groupUsesTilePicker,
  isGroupActive,
  navGroupByLabel,
  navTilesForGroup,
  type NavGroupConfig
} from '@/lib/app-nav'
import { formatAppUserDisplayName } from '@/lib/roles'

const SIDEBAR_COLLAPSED_KEY = 'shift-close-sidebar-collapsed'

function GroupIcon({ label }: { label: string }) {
  const d = NAV_GROUP_ICON[label]
  if (!d) return null
  return (
    <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

function NavGroupRow({
  group,
  isActive,
  onClick,
  expanded
}: {
  group: NavGroupConfig
  isActive: boolean
  onClick: () => void
  expanded?: boolean
}) {
  const usesPicker = groupUsesTilePicker(group)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all ${
        isActive || expanded
          ? 'bg-slate-700/90 text-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.25)]'
          : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'
      }`}
    >
      <GroupIcon label={group.label} />
      <span className="min-w-0 flex-1 truncate">{group.label}</span>
      {usesPicker ? (
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      ) : null}
    </button>
  )
}

export default function AppNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { openPickerGroup, closePickerGroup, registerMobileNavCloser } = useNav()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileDrillGroup, setMobileDrillGroup] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [todayPayDays, setTodayPayDays] = useState<Array<{ id: string; date: string; notes: string | null }>>([])
  const [showFeaturesModal, setShowFeaturesModal] = useState(false)

  const closeMobile = useCallback(() => {
    setMobileOpen(false)
    setMobileDrillGroup(null)
  }, [])

  useEffect(() => {
    registerMobileNavCloser(closeMobile)
  }, [registerMobileNavCloser, closeMobile])

  useEffect(() => {
    closePickerGroup()
    setMobileDrillGroup(null)
    if (mobileOpen) {
      setMobileOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close nav chrome on route change only
  }, [pathname])

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true') {
        setSidebarCollapsed(true)
      }
    } catch {
      // ignore
    }
  }, [])

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

  const filteredNav = useMemo(() => buildFilteredNavGroups(role), [role])

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      }
      return next
    })
  }

  const handleGroupClick = (group: NavGroupConfig) => {
    const items = flattenNavItems(group.items)
    if (items.length === 1) {
      router.push(items[0].href)
      closeMobile()
      closePickerGroup()
      return
    }

    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    if (isDesktop) {
      openPickerGroup(group.label)
      closeMobile()
    } else {
      setMobileDrillGroup(group.label)
    }
  }

  const mobileDrill = mobileDrillGroup ? navGroupByLabel(filteredNav, mobileDrillGroup) : null

  const sidebar = (
    <nav
      className={`flex h-full min-h-0 flex-col bg-slate-900 text-white shadow-lg shadow-slate-950/30 shrink-0 transition-all duration-200 ease-in-out ${
        sidebarCollapsed ? 'w-16' : 'w-[85vw] max-w-72 lg:w-64'
      }`}
    >
      <div
        className={`border-b border-slate-700/80 min-h-[64px] flex-shrink-0 flex items-center ${
          sidebarCollapsed ? 'flex-col justify-center gap-1 py-3 px-2' : 'flex-row justify-between px-4 py-3.5 gap-2'
        }`}
      >
        <Link
          href="/dashboard"
          prefetch={false}
          onClick={closeMobile}
          className={`flex items-center min-w-0 ${sidebarCollapsed ? 'justify-center' : 'gap-2'}`}
        >
          {sidebarCollapsed ? (
            <span className="text-base font-semibold text-slate-200">SC</span>
          ) : (
            <span className="text-sm font-semibold text-slate-200">Shift Close</span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden lg:flex flex-shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
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
        <div className="flex-shrink-0 border-b border-amber-300/20 bg-amber-500/80 px-3 py-2 text-sm font-semibold text-white">
          <span className="inline-block mr-1">💰</span>
          Today is Pay Day — Accounting will process payments
        </div>
      )}
      <div className={`scrollbar-subtle flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 ${sidebarCollapsed ? 'hidden' : ''}`}>
        {mobileDrill ? (
          <div className="px-3">
            <button
              type="button"
              onClick={() => setMobileDrillGroup(null)}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Menu
            </button>
            <h2 className="mb-3 px-1 text-sm font-semibold text-white">{mobileDrill.label}</h2>
            <NavGroupTiles tiles={navTilesForGroup(mobileDrill)} onNavigate={closeMobile} compact />
          </div>
        ) : (
          <div className="space-y-1 px-3">
            {filteredNav.map((group) => (
              <NavGroupRow
                key={group.label}
                group={group}
                isActive={isGroupActive(group, pathname ?? '')}
                onClick={() => handleGroupClick(group)}
              />
            ))}
          </div>
        )}
      </div>
      {!sidebarCollapsed && user && (
        <div className="flex-shrink-0 border-t border-slate-700/80 px-3 py-3 text-xs text-slate-300 truncate" title={user.email}>
          {formatAppUserDisplayName(user)}
          <span className="block text-[10px] text-slate-500 capitalize">{user.role.replace(/_/g, ' ')}</span>
        </div>
      )}
      <div
        className={`flex-shrink-0 border-t border-slate-700/80 p-2.5 flex gap-2 ${
          sidebarCollapsed ? 'flex-col items-center' : 'justify-between items-center'
        }`}
      >
        <button
          type="button"
          onClick={() => setShowFeaturesModal(true)}
          className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          title="View planned features"
          aria-label="View planned features"
        >
          <span className="text-xl">ℹ️</span>
        </button>
        {user && (
          <button
            type="button"
            onClick={() => void logout()}
            className={`rounded-md text-slate-300 transition-colors hover:bg-slate-700 hover:text-white ${
              sidebarCollapsed ? 'p-2' : 'text-xs px-2.5 py-1.5'
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
      <button
        type="button"
        onClick={() => {
          if (mobileOpen) closeMobile()
          else setMobileOpen(true)
        }}
        className="lg:hidden fixed top-4 left-4 z-50 rounded-md bg-slate-900/95 p-2 text-white shadow-lg"
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

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={closeMobile} aria-hidden="true" />
      )}

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
