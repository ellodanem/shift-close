'use client'

import { useEffect, useState } from 'react'

type Health = {
  level: 'ok' | 'warn' | 'error'
  message: string | null
  lastCustomerSyncAt: string | null
}

function formatWhen(value: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', {
    timeZone: 'America/St_Lucia',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

/** Warns when Cstore customer data is not syncing (agent paused/offline or data stale). */
export default function SyncHealthBanner() {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/customer-accounts/sync-health')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) setHealth(data)
        })
        .catch(() => {})
    load()
    const timer = setInterval(load, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (!health) return null
  const lastSync = formatWhen(health.lastCustomerSyncAt)

  if (health.level === 'ok' || !health.message) {
    return lastSync ? (
      <p className="mb-3 text-xs text-gray-500">Last synced from Cstore: {lastSync}</p>
    ) : null
  }

  const error = health.level === 'error'
  return (
    <div
      role="alert"
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
        error
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <p className="font-semibold">
        {error ? 'Cstore sync is not running' : 'Cstore data may be out of date'}
      </p>
      <p className="mt-0.5">{health.message}</p>
      <p className="mt-1 text-xs opacity-80">
        Last successful customer sync: {lastSync ?? 'never'}
      </p>
    </div>
  )
}
