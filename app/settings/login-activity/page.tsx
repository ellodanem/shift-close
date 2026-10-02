'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/components/AuthContext'

interface LoginEventRow {
  id: string
  username: string
  displayName: string
  loggedAt: string
}

function formatLoggedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export default function LoginActivityPage() {
  const { loading: authLoading, canManageUsers } = useAuth()
  const [events, setEvents] = useState<LoginEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/login-audit', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load login activity')
      }
      setEvents(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading || !canManageUsers) return
    void load()
  }, [authLoading, canManageUsers, load])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center text-gray-600">
        Loading…
      </div>
    )
  }

  if (!canManageUsers) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-gray-700">You do not have access to login activity.</p>
        <Link href="/settings" className="text-blue-600 mt-4 inline-block">
          ← Settings
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/settings" className="text-sm text-blue-600 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Login activity</h1>
          <p className="text-sm text-gray-600 mt-1">
            Successful sign-ins, newest first. The latest 200 are shown.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="p-4 text-gray-500">Loading…</p>
          ) : events.length === 0 ? (
            <p className="p-4 text-gray-600">No sign-ins recorded yet. The next login will appear here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2">Who</th>
                    <th className="text-left px-4 py-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const name = event.displayName.trim() || event.username
                    const showUsername = name.toLowerCase() !== event.username.toLowerCase()
                    return (
                      <tr key={event.id} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-800">
                          <div className="font-medium">{name}</div>
                          {showUsername ? <div className="text-xs text-gray-500">{event.username}</div> : null}
                        </td>
                        <td className="px-4 py-2 text-gray-700">{formatLoggedAt(event.loggedAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
