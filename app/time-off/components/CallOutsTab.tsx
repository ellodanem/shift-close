'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import CallOutCalledAtFields from '@/app/components/CallOutCalledAtFields'
import { useAuth } from '@/app/components/AuthContext'
import {
  buildCallOutTooltip,
  combineCalledAtParts,
  defaultCalledAtPartsNow,
  formatCalledAtLocal,
  normalizeCallOutDate,
  sickLeaveCoversDate,
  type CalledAtParts
} from '@/lib/call-outs'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { staffDisplayLabel } from './staff-label'

interface CallOutRow {
  id: string
  staffId: string
  staffName: string
  staffFirstName?: string
  date: string
  calledAt: string
  notes: string
  recordedByLabel?: string | null
}

interface StaffOption {
  id: string
  name: string
  firstName?: string
  lastName?: string
  status: string
}

interface SickLeaveRow {
  id: string
  staffId: string
  startDate: string
  endDate: string
  status: string
}

type CallOutsTabProps = {
  initialDate?: string | null
}

export default function CallOutsTab({ initialDate }: CallOutsTabProps) {
  const { canLogCallOut } = useAuth()
  const today = businessTodayYmd()
  const initialDay = useMemo(() => {
    if (!initialDate) return today
    return normalizeCallOutDate(initialDate) ?? today
  }, [initialDate, today])

  const [filterDate, setFilterDate] = useState(initialDay)
  const [rows, setRows] = useState<CallOutRow[]>([])
  const [sickLeaves, setSickLeaves] = useState<SickLeaveRow[]>([])
  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [logStaffId, setLogStaffId] = useState('')
  const [logDate, setLogDate] = useState(initialDay)
  const [logNotes, setLogNotes] = useState('')
  const [logCalledAtParts, setLogCalledAtParts] = useState<CalledAtParts>(defaultCalledAtPartsNow())
  const [saving, setSaving] = useState(false)

  const activeStaff = useMemo(
    () => staffList.filter((s) => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name)),
    [staffList]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [coRes, staffRes, bundleRes] = await Promise.all([
        fetch(`/api/call-outs?startDate=${filterDate}&endDate=${filterDate}`),
        fetch('/api/staff'),
        fetch(`/api/roster/week-bundle?weekStart=${filterDate}&weekEnd=${filterDate}`)
      ])
      if (!coRes.ok) throw new Error('Failed to load call outs')
      setRows(await coRes.json())
      if (staffRes.ok) {
        const staff = (await staffRes.json()) as StaffOption[]
        setStaffList(staff)
      }
      if (bundleRes.ok) {
        const bundle = await bundleRes.json()
        setSickLeaves(Array.isArray(bundle.sickLeaves) ? bundle.sickLeaves : [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [filterDate])

  useEffect(() => {
    setFilterDate(initialDay)
    setLogDate(initialDay)
  }, [initialDay])

  useEffect(() => {
    void load()
  }, [load])

  const sickOverlap = (row: CallOutRow) =>
    sickLeaves.some((sl) => sl.staffId === row.staffId && sickLeaveCoversDate(sl, row.date))

  const handleLog = async () => {
    if (!logStaffId || !logDate) return
    setSaving(true)
    try {
      const body: { date: string; notes: string; calledAt?: string } = {
        date: logDate,
        notes: logNotes
      }
      const calledAtIso = combineCalledAtParts(logCalledAtParts)
      if (calledAtIso) body.calledAt = calledAtIso
      const res = await fetch(`/api/staff/${logStaffId}/call-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save')
      }
      setLogNotes('')
      setLogCalledAtParts(defaultCalledAtPartsNow())
      if (logDate === filterDate) await load()
      else setFilterDate(logDate)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this call out?')) return
    try {
      const res = await fetch(`/api/call-outs/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      await load()
    } catch {
      alert('Failed to delete')
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Phone call log for staff who will not work a scheduled day. Does not change hours or pay
        period — shown on the roster. Sick leave entered later can overlap the same dates.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Day
          </label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
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

      {canLogCallOut ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Log call out</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Staff</label>
              <select
                value={logStaffId}
                onChange={(e) => setLogStaffId(e.target.value)}
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Work date</label>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <CallOutCalledAtFields
                value={logCalledAtParts}
                onChange={setLogCalledAtParts}
                labelClassName="block text-xs font-medium text-gray-600 mb-1"
                fieldClassName="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="e.g. Sick — not coming in"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={!logStaffId || !logDate || saving}
            onClick={() => void handleLog()}
            className="mt-4 px-4 py-2 bg-teal-600 text-white rounded text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save call out'}
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600 bg-white rounded-lg border border-gray-200 p-5">
          No call outs for {filterDate}.
        </p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Called</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Logged by</th>
                {canLogCallOut ? <th className="px-4 py-3 w-16" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overlap = sickOverlap(r)
                return (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {staffDisplayLabel(r)}
                      {overlap ? (
                        <span
                          className="ml-2 text-[10px] font-semibold uppercase text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded"
                          title="Sick leave also covers this day"
                        >
                          + sick
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                      {formatCalledAtLocal(r.calledAt)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-gray-600 max-w-xs truncate"
                      title={buildCallOutTooltip({
                        calledAt: r.calledAt,
                        notes: r.notes,
                        recordedByLabel: r.recordedByLabel,
                        sickLeaveOverlap: overlap
                      })}
                    >
                      {r.notes || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{r.recordedByLabel || '—'}</td>
                    {canLogCallOut ? (
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => void handleDelete(r.id)}
                          className="text-gray-400 hover:text-red-600 text-lg leading-none"
                          title="Remove"
                        >
                          ×
                        </button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
