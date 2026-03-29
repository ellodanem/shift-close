'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/components/AuthContext'

interface PublicHolidayRow {
  id: string
  date: string
  name: string
  stationClosed: boolean
}

export default function PublicHolidaysSettingsPage() {
  const { loading: authLoading, canManageUsers } = useAuth()
  const [year, setYear] = useState(() => String(new Date().getFullYear()))
  const [rows, setRows] = useState<PublicHolidayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/public-holidays?year=${encodeURIComponent(year)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Failed to load')
      }
      const data = (await res.json()) as PublicHolidayRow[]
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    if (authLoading) return
    void load()
  }, [authLoading, load])

  const toggleClosed = async (row: PublicHolidayRow) => {
    if (!canManageUsers) return
    setSavingId(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/public-holidays/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationClosed: !row.stationClosed })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Failed to save')
      }
      const updated = (await res.json()) as PublicHolidayRow
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingId(null)
    }
  }

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
        <div className="max-w-2xl mx-auto rounded border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          Only administrators and managers can manage public holidays.
        </div>
        <Link href="/settings" className="mt-4 inline-block text-blue-600 hover:underline">
          ← Back to Settings
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
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Public holidays (St. Lucia)</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Dates are seeded for each year (e.g. 2026). <strong>Station fully closed</strong> means no shifts
            can be scheduled that day — the roster shows &quot;Closed&quot; and blocks editing for that column.
            Other holidays are shown as a reminder only; you can still assign shifts if the station is open.
          </p>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <label className="text-sm font-medium text-gray-700">Year</label>
          <input
            type="number"
            min={2024}
            max={2040}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-28"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-600 text-sm">Loading holidays…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-600 text-sm">
            No holidays for {year}. Run{' '}
            <code className="bg-gray-100 px-1 rounded">npx prisma db seed</code> after deploying new years, or add
            rows via the database.
          </p>
        ) : (
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Date</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Name</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Station fully closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className={row.stationClosed ? 'bg-amber-50/50' : ''}>
                    <td className="px-4 py-2 font-mono text-gray-900">{row.date}</td>
                    <td className="px-4 py-2 text-gray-800">{row.name}</td>
                    <td className="px-4 py-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.stationClosed}
                          disabled={savingId === row.id}
                          onChange={() => void toggleClosed(row)}
                          className="rounded border-gray-300 text-amber-700 focus:ring-amber-500"
                        />
                        <span className="text-gray-700">
                          {row.stationClosed ? 'Closed — no shifts' : 'Open — shifts allowed'}
                        </span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
