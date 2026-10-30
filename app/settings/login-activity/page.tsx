'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/components/AuthContext'

interface LoginEventRow {
  id: string
  username: string
  displayName: string
  loggedAt: string
}

interface PageVisitRow {
  id: string
  path: string
  visitedAt: string
}

interface VisitsState {
  loading: boolean
  error: string | null
  visits: PageVisitRow[]
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

function formatVisitTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

export default function LoginActivityPage() {
  const { loading: authLoading, canManageUsers } = useAuth()
  const [events, setEvents] = useState<LoginEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [visitsById, setVisitsById] = useState<Record<string, VisitsState>>({})

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

  const loadVisits = useCallback(async (id: string) => {
    setVisitsById((prev) => ({ ...prev, [id]: { loading: true, error: null, visits: [] } }))
    try {
      const res = await fetch(`/api/login-audit/${encodeURIComponent(id)}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load pages')
      }
      setVisitsById((prev) => ({
        ...prev,
        [id]: { loading: false, error: null, visits: Array.isArray(data) ? data : [] }
      }))
    } catch (e) {
      setVisitsById((prev) => ({
        ...prev,
        [id]: { loading: false, error: e instanceof Error ? e.message : 'Failed to load pages', visits: [] }
      }))
    }
  }, [])

  const toggleEvent = useCallback(
    (id: string) => {
      if (expandedId === id) {
        setExpandedId(null)
        return
      }
      setExpandedId(id)
      if (!visitsById[id]) void loadVisits(id)
    },
    [expandedId, visitsById, loadVisits]
  )

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
            Successful sign-ins, newest first. The latest 200 are shown. Select a sign-in to see the pages opened
            during that session. Page history is kept for 90 days.
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
                    <th className="text-right px-4 py-2">Pages</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const name = event.displayName.trim() || event.username
                    const showUsername = name.toLowerCase() !== event.username.toLowerCase()
                    const expanded = expandedId === event.id
                    const state = visitsById[event.id]
                    return (
                      <Fragment key={event.id}>
                        <tr
                          className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                          onClick={() => toggleEvent(event.id)}
                        >
                          <td className="px-4 py-2 text-gray-800">
                            <div className="font-medium">{name}</div>
                            {showUsername ? <div className="text-xs text-gray-500">{event.username}</div> : null}
                          </td>
                          <td className="px-4 py-2 text-gray-700">{formatLoggedAt(event.loggedAt)}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              className="text-blue-600 hover:underline"
                              aria-expanded={expanded}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleEvent(event.id)
                              }}
                            >
                              {expanded ? 'Hide pages' : 'View pages'}
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="bg-gray-50">
                            <td colSpan={3} className="px-4 py-3">
                              {!state || state.loading ? (
                                <p className="text-gray-500">Loading pages…</p>
                              ) : state.error ? (
                                <p className="text-red-700">{state.error}</p>
                              ) : state.visits.length === 0 ? (
                                <p className="text-gray-600">
                                  No pages recorded for this sign-in. Older sign-ins, or sessions started before page
                                  tracking, have no page history.
                                </p>
                              ) : (
                                <ol className="space-y-1">
                                  {state.visits.map((visit) => (
                                    <li key={visit.id} className="flex gap-4 text-gray-800">
                                      <span className="w-24 shrink-0 text-gray-500 tabular-nums">
                                        {formatVisitTime(visit.visitedAt)}
                                      </span>
                                      <span className="font-mono text-xs sm:text-sm break-all">{visit.path}</span>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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
