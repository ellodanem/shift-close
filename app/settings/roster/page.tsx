'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ROSTER_MIN_OFF_DAYS_PER_WEEK_DEFAULT } from '@/lib/roster-settings'

export default function RosterSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [minOffDaysPerWeek, setMinOffDaysPerWeek] = useState(ROSTER_MIN_OFF_DAYS_PER_WEEK_DEFAULT)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/roster/settings', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      const n = Number(data.minOffDaysPerWeek)
      setMinOffDaysPerWeek(Number.isFinite(n) ? n : ROSTER_MIN_OFF_DAYS_PER_WEEK_DEFAULT)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void load().finally(() => setLoading(false))
  }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/roster/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minOffDaysPerWeek })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      const n = Number(data.minOffDaysPerWeek)
      setMinOffDaysPerWeek(Number.isFinite(n) ? n : minOffDaysPerWeek)
      setSuccess('Saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <Link href="/settings" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            ← Settings
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Roster</h1>
          <p className="mt-1 text-sm text-gray-600">
            Rules used when building the weekly roster. Warnings are visual only — you can still save a full week when
            needed.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4">
            <div>
              <label htmlFor="min-off-days" className="block text-sm font-medium text-gray-700 mb-1">
                Minimum off days per staff (per week)
              </label>
              <input
                id="min-off-days"
                type="number"
                min={0}
                max={7}
                value={minOffDaysPerWeek}
                onChange={(e) => setMinOffDaysPerWeek(Number(e.target.value))}
                className="w-24 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="mt-2 text-xs text-gray-500">
                Staff with fewer off days in the current week get a flashing red name on the roster. Vacation, sick
                leave, and &quot;Off&quot; shifts count as off. Station-closed days are ignored. Set to 0 to turn off
                warnings.
              </p>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-green-700">{success}</p> : null}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
