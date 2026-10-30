'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthContext'

const UNTRACKED_PREFIXES = ['/login', '/reset-password', '/forgot-password', '/apply']

/** Reports each page opened by a signed-in user so admins can see it under Login activity. */
export default function PageVisitTracker() {
  const pathname = usePathname()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const lastReportedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!userId) {
      lastReportedRef.current = null
      return
    }
    if (!pathname) return
    if (UNTRACKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return

    const key = `${userId}:${pathname}`
    if (lastReportedRef.current === key) return
    lastReportedRef.current = key

    // Fire and forget: tracking must never slow down or break navigation.
    void fetch('/api/auth/page-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      keepalive: true
    }).catch(() => {})
  }, [pathname, userId])

  return null
}
