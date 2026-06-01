'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { staffDisplayLabel } from './staff-label'

interface StaffOption {
  id: string
  name: string
  firstName?: string
  lastName?: string
  status: string
  vacationStart?: string | null
  vacationEnd?: string | null
}

interface DayOffRow {
  id: string
  staffId: string
  staffName: string
  staffFirstName?: string
  date: string
  reason?: string | null
  status: string
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart
}

const statusColors: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  requested: 'bg-yellow-100 text-yellow-800'
}

export default function VacationDayOffTab() {
  const today = businessTodayYmd()
  const [rangeStart, setRangeStart] = useState(() => addDaysYmd(today, -14))
  const [rangeEnd, setRangeEnd] = useState(() => addDaysYmd(today, 60))

  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [dayOffs, setDayOffs] = useState<DayOffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [vacStaffId, setVacStaffId] = useState('')
  const [vacStart, setVacStart] = useState('')
  const [vacEnd, setVacEnd] = useState('')
  const [savingVacation, setSavingVacation] = useState(false)

  const [dayOffStaffId, setDayOffStaffId] = useState('')
  const [dayOffDate, setDayOffDate] = useState('')
  const [dayOffReason, setDayOffReason] = useState('')
  const [savingDayOff, setSavingDayOff] = useState(false)

  const activeStaff = useMemo(
    () => staffList.filter((s) => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name)),
    [staffList]
  )

  const vacations = useMemo(() => {
    return activeStaff
      .filter(
        (s) =>
          s.vacationStart &&
          s.vacationEnd &&
          rangesOverlap(s.vacationStart, s.vacationEnd, rangeStart, rangeEnd)
      )
      .map((s) => ({
        staffId: s.id,
        staffName: s.name,
        staffFirstName: s.firstName,
        vacationStart: s.vacationStart!,
        vacationEnd: s.vacationEnd!
      }))
      .sort((a, b) => a.vacationStart.localeCompare(b.vacationStart))
  }, [activeStaff, rangeStart, rangeEnd])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [staffRes, dayOffRes] = await Promise.all([
        fetch('/api/staff'),
        fetch(`/api/staff/day-off?startDate=${rangeStart}&endDate=${rangeEnd}`)
      ])
      if (!staffRes.ok) throw new Error('Failed to load staff')
      setStaffList(await staffRes.json())
      if (!dayOffRes.ok) throw new Error('Failed to load day off records')
      setDayOffs(await dayOffRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [rangeStart, rangeEnd])

  useEffect(() => {
    void load()
  }, [load])

  const saveVacation = async () => {
    if (!vacStaffId || !vacStart.trim() || !vacEnd.trim()) {
      alert('Select staff and enter both vacation dates.')
      return
    }
    if (vacStart > vacEnd) {
      alert('End date must be on or after start date.')
      return
    }
    setSavingVacation(true)
    try {
      const res = await fetch(`/api/staff/${vacStaffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacationStart: vacStart.trim(), vacationEnd: vacEnd.trim() })
      })
      if (!res.ok) throw new Error('Failed to save vacation')
      setVacStaffId('')
      setVacStart('')
      setVacEnd('')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save vacation')
    } finally {
      setSavingVacation(false)
    }
  }

  const clearVacation = async (staffId: string) => {
    if (!confirm('Clear vacation for this staff member?')) return
    setSavingVacation(true)
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacationStart: null, vacationEnd: null })
      })
      if (!res.ok) throw new Error('Failed to clear vacation')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to clear vacation')
    } finally {
      setSavingVacation(false)
    }
  }

  const addDayOff = async () => {
    if (!dayOffStaffId || !dayOffDate) return
    setSavingDayOff(true)
    try {
      const res = await fetch(`/api/staff/${dayOffStaffId}/day-off`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dayOffDate, reason: dayOffReason })
      })
      if (!res.ok) throw new Error('Failed to save day off')
      setDayOffDate('')
      setDayOffReason('')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save day off')
    } finally {
      setSavingDayOff(false)
    }
  }

  const deleteDayOff = async (id: string) => {
    if (!confirm('Remove this day off?')) return
    try {
      const res = await fetch(`/api/staff/day-off/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      await load()
    } catch {
      alert('Failed to delete')
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Vacation blocks roster scheduling for a date range. Day offs are single planned days off
        separate from vacation.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            From
          </label>
          <input
            type="date"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            To
          </label>
          <input
            type="date"
            value={rangeEnd}
            min={rangeStart}
            onChange={(e) => setRangeEnd(e.target.value)}
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

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Set vacation</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Staff</label>
            <select
              value={vacStaffId}
              onChange={(e) => setVacStaffId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select staff…</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
            <input
              type="date"
              value={vacStart}
              onChange={(e) => setVacStart(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
            <input
              type="date"
              value={vacEnd}
              min={vacStart}
              onChange={(e) => setVacEnd(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!vacStaffId || !vacStart || !vacEnd || savingVacation}
              onClick={() => void saveVacation()}
              className="w-full px-4 py-2 bg-amber-600 text-white rounded text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
            >
              {savingVacation ? 'Saving…' : 'Save vacation'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Add day off</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Staff</label>
            <select
              value={dayOffStaffId}
              onChange={(e) => setDayOffStaffId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select staff…</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date"
              value={dayOffDate}
              onChange={(e) => setDayOffDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={dayOffReason}
              onChange={(e) => setDayOffReason(e.target.value)}
              placeholder="e.g. Medical appointment"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!dayOffStaffId || !dayOffDate || savingDayOff}
              onClick={() => void addDayOff()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {savingDayOff ? 'Saving…' : 'Add day off'}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Vacation periods</h2>
            {vacations.length === 0 ? (
              <p className="text-sm text-gray-600 bg-white rounded-lg border border-gray-200 p-5">
                No vacation periods in this range.
              </p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Staff</th>
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {vacations.map((v) => (
                      <tr key={v.staffId} className="border-b border-gray-100">
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          <Link
                            href={`/staff/${v.staffId}`}
                            className="text-blue-700 hover:text-blue-900"
                          >
                            {staffDisplayLabel(v)}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">
                          {v.vacationStart} – {v.vacationEnd}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            disabled={savingVacation}
                            onClick={() => void clearVacation(v.staffId)}
                            className="text-xs font-medium text-red-600 hover:text-red-800"
                          >
                            Clear
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Day offs</h2>
            {dayOffs.length === 0 ? (
              <p className="text-sm text-gray-600 bg-white rounded-lg border border-gray-200 p-5">
                No day offs in this range.
              </p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Staff</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {dayOffs.map((d) => (
                      <tr key={d.id} className="border-b border-gray-100">
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          <Link
                            href={`/staff/${d.staffId}`}
                            className="text-blue-700 hover:text-blue-900"
                          >
                            {staffDisplayLabel(d)}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{d.date}</td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">
                          {d.reason || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                              statusColors[d.status] ?? 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => void deleteDayOff(d.id)}
                            className="text-gray-400 hover:text-red-600 text-lg leading-none"
                            title="Remove"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
