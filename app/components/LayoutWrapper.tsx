'use client'

import { usePathname } from 'next/navigation'
import AppNav from './AppNav'

export default function LayoutWrapper({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
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
      <main className="flex-1 min-w-0 pt-14 pl-14 lg:pt-0 lg:pl-0">
        {children}
      </main>
    </div>
  )
}
