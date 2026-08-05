'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

type RentDueStatus = {
  due: boolean
  monthLabel: string
}

/**
 * Sticky site-wide banner while Rubis rent is due and no matching Fuel Payments
 * Rent invoice exists for the current month.
 */
export default function RentDueBanner() {
  const { user, loading: authLoading } = useAuth()
  const [status, setStatus] = useState<RentDueStatus | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/rent-due/status', { cache: 'no-store' })
      if (!res.ok) {
        setStatus(null)
        return
      }
      const data = (await res.json()) as RentDueStatus
      setStatus(data)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    if (authLoading || !user) {
      setStatus(null)
      return
    }
    void load()
    const id = window.setInterval(() => void load(), 5 * 60 * 1000)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [authLoading, user, load])

  if (!status?.due) return null

  return (
    <div
      role="alert"
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-red-300 bg-red-600 px-3 py-2 text-white sm:px-4"
    >
      <p className="text-sm font-semibold">
        Rubis rent is due — {status.monthLabel}. No Rent invoice found in Fuel Payments for this month.
      </p>
      <Link
        href="/fuel-payments"
        className="shrink-0 rounded-md bg-white/15 px-3 py-1 text-sm font-semibold text-white hover:bg-white/25"
      >
        Open Fuel Payments →
      </Link>
    </div>
  )
}
