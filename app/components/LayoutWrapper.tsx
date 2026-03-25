'use client'

import { usePathname } from 'next/navigation'
import AppNav from './AppNav'
import { useAuth } from './AuthContext'
import { formatAppUserDisplayName } from '@/lib/roles'

export default function LayoutWrapper({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { user, loading, logout } = useAuth()
  const isApplyRoute = pathname?.startsWith('/apply')
  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/reset-password' ||
    pathname === '/forgot-password'

  if (isApplyRoute || isAuthRoute) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AppNav />
      <div className="flex flex-1 flex-col min-w-0 pt-14 pl-14 lg:pt-0 lg:pl-0">
        {!loading && user && (
          <header className="flex h-11 flex-shrink-0 items-center justify-end gap-3 border-b border-gray-200 bg-white px-3 sm:px-4">
            <span className="truncate text-sm text-gray-700 max-w-[60vw] sm:max-w-md" title={user.email}>
              {formatAppUserDisplayName(user)}
              <span className="ml-2 text-xs text-gray-500 capitalize hidden sm:inline">
                ({user.role.replace(/_/g, ' ')})
              </span>
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex-shrink-0 rounded-md px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 hover:underline"
            >
              Log out
            </button>
          </header>
        )}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  )
}
