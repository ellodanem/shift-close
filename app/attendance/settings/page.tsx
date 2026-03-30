'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

export default function AttendanceSettingsPage() {
  const [expectedPunchesPerDay, setExpectedPunchesPerDay] = useState(4)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setMessage(null)
    try {
      const res = await fetch('/api/attendance/settings', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { expectedPunchesPerDay?: number }
      if (typeof data.expectedPunchesPerDay === 'number' && data.expectedPunchesPerDay >= 1) {
        setExpectedPunchesPerDay(data.expectedPunchesPerDay)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/attendance/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedPunchesPerDay })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save')
      }
      if (typeof data.expectedPunchesPerDay === 'number') {
        setExpectedPunchesPerDay(data.expectedPunchesPerDay)
      }
      setMessage('Saved.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href="/attendance"
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            ← Attendance
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Attendance settings</h1>
          <p className="mt-1 text-sm text-gray-600">
            Rules used when flagging irregular punches on the Attendance Logs tab.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="expected-punches-per-day" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Expected punches per day
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="expected-punches-per-day"
                  type="number"
                  min={1}
                  max={24}
                  value={expectedPunchesPerDay}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!Number.isFinite(v)) return
                    setExpectedPunchesPerDay(Math.min(24, Math.max(1, v)))
                  }}
                  className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-600 max-w-xl pb-0.5">
              Default <span className="font-medium text-gray-800">4</span> is a standard full day (two in/out pairs). Colors use the same
              calendar day as the <span className="font-medium text-gray-800">Date</span> column in your browser (not UTC). Deleted punches
              are not counted. On the logs table: <span className="font-medium text-gray-800">green</span> when that day has this many
              punches and valid in/out pairing; <span className="font-medium text-sky-800">blue</span> (Possible missed) when there are only two punches but
              they form a valid in/out pair; <span className="font-medium text-red-800">red</span> for any other issue.
            </p>
          </div>
          {message && (
            <p className={`mt-3 text-sm ${message === 'Saved.' ? 'text-emerald-700' : 'text-red-700'}`}>{message}</p>
          )}
        </div>
      </div>
    </div>
  )
}
