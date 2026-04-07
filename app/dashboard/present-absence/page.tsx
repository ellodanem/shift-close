'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/app/components/AuthContext'

interface Row {
  staffId: string
  staffName: string
  staffFirstName: string
  shiftName: string
  shiftColor: string | null
  shiftStartTime: string
  status: string
  lateReason: string
  graceEndsAt: string | null
  isExpected: boolean
  manualPresent: boolean
  manualAbsent?: boolean
  punchExempt?: boolean
}

export default function PresentAbsencePage() {
  const { isStakeholder } = useAuth()
  const [date, setDate] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [stationTimeZone, setStationTimeZone] = useState('')
  const [todayYmd, setTodayYmd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<Row | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const q = date ? `?date=${encodeURIComponent(date)}` : ''
      const res = await fetch(`/api/attendance/present-absence${q}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setEnabled(!!data.enabled)
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setStationTimeZone(typeof data.stationTimeZone === 'string' ? data.stationTimeZone : '')
      setTodayYmd(typeof data.todayYmd === 'string' ? data.todayYmd : '')
      if (!date && typeof data.date === 'string') setDate(data.date)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load])

  const statusLabel = (s: string) => {
    switch (s) {
      case 'present':
        return 'Present'
      case 'late':
        return 'Late'
      case 'absent':
        return 'Absent'
      case 'pending':
        return 'Pending'
      case 'off':
        return 'Off'
      default:
        return s
    }
  }

  const statusClass = (s: string) => {
    switch (s) {
      case 'present':
        return 'text-emerald-700 bg-emerald-50'
      case 'late':
        return 'text-amber-800 bg-amber-50'
      case 'absent':
        return 'text-red-700 bg-red-50'
      case 'pending':
        return 'text-slate-600 bg-slate-50'
      case 'off':
        return 'text-slate-500 bg-gray-100'
      default:
        return 'text-gray-700 bg-gray-50'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            ← Dashboard
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Present / Absent</h1>
          <p className="mt-1 text-sm text-gray-600">
            Scheduled staff for the selected day (station timezone{stationTimeZone ? `: ${stationTimeZone}` : ''}).
            {todayYmd ? ` Today in station time: ${todayYmd}.` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !enabled ? (
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
            <p className="text-sm text-gray-700">
              Present / absent tracking is turned off. Enable it under{' '}
              <Link href="/attendance/settings" className="text-blue-600 font-medium hover:text-blue-800">
                Attendance → Settings
              </Link>
              .
            </p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-600">No one scheduled for this day.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Shift</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.staffId}
                    className={`border-b border-gray-100 ${!isStakeholder ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                    onClick={() => {
                      if (!isStakeholder) setModal({ ...r })
                    }}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {r.staffFirstName ?? r.staffName}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: r.shiftColor || '#94a3b8' }}
                        />
                        {r.shiftName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${statusClass(r.status)}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                      {!r.isExpected ? (
                        <span className="ml-2 text-xs text-gray-500">(not expected)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate" title={r.lateReason}>
                      {r.lateReason ||
                        (r.punchExempt
                          ? r.manualAbsent
                            ? 'Absent (punch exempt)'
                            : 'Auto present (no punch)'
                          : r.manualPresent
                            ? 'Manual present'
                            : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isStakeholder ? (
              <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
                Click a row to edit overrides (manual present, absent for exempt staff, or notes).
              </p>
            ) : null}
          </div>
        )}
      </div>

      {modal && !isStakeholder && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Edit attendance</h3>
            <p className="text-sm text-gray-600 mb-4">
              {modal.staffFirstName ?? modal.staffName} · {date}
            </p>
            <div className="space-y-4">
              {modal.punchExempt ? (
                <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Punch exempt: counted as present without a clock-in. Use absent below if they did not work this day.
                </p>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modal.manualPresent}
                    onChange={(e) => setModal((m) => (m ? { ...m, manualPresent: e.target.checked } : m))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-800">Mark present manually</span>
                </label>
              )}
              {modal.punchExempt ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modal.manualAbsent === true}
                    onChange={(e) =>
                      setModal((m) =>
                        m ? { ...m, manualAbsent: e.target.checked, manualPresent: false } : m
                      )
                    }
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-800">Absent for this day</span>
                </label>
              ) : null}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Late / absence note (optional)
                </label>
                <textarea
                  value={modal.lateReason}
                  onChange={(e) => setModal((m) => (m ? { ...m, lateReason: e.target.value } : m))}
                  rows={3}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  try {
                    const res = await fetch('/api/attendance/present-absence/override', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        staffId: modal.staffId,
                        date,
                        manualPresent: modal.punchExempt ? false : modal.manualPresent,
                        manualAbsent: modal.punchExempt ? modal.manualAbsent === true : false,
                        lateReason: modal.lateReason
                      })
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) {
                      throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save')
                    }
                    setModal(null)
                    await load()
                  } catch (e) {
                    alert(e instanceof Error ? e.message : 'Failed to save')
                  } finally {
                    setSaving(false)
                  }
                }}
                className="px-4 py-2 bg-slate-700 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
