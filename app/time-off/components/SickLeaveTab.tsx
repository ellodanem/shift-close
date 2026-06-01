'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addCalendarDaysYmd, businessTodayYmd } from '@/lib/datetime-policy'
import type { TimeOffSickLeaveRow } from '@/lib/time-off-bundle'
import { validateTimeOffDateRange } from '@/lib/time-off-range'
import { useTimeOff } from '../TimeOffProvider'
import { staffDisplayLabel } from './staff-label'
import { TimeOffFormHeading, TimeOffListHeading } from './time-off-headings'
import TruncatedNotice from './TruncatedNotice'

/** Inclusive calendar days from start through end (YYYY-MM-DD). */
function sickLeaveInclusiveDays(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T12:00:00`)
  const end = new Date(`${endYmd}T12:00:00`)
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
}

const statusColors: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  requested: 'bg-yellow-100 text-yellow-800'
}

export default function SickLeaveTab() {
  const { staffOptions, staffLoading, staffError, fetchBundle, invalidateBundles } = useTimeOff()
  const today = businessTodayYmd()
  const [rangeStart, setRangeStart] = useState(() => addCalendarDaysYmd(today, -30))
  const [rangeEnd, setRangeEnd] = useState(() => addCalendarDaysYmd(today, 30))

  const [rows, setRows] = useState<TimeOffSickLeaveRow[]>([])
  const [truncated, setTruncated] = useState({ dayOffs: false, sickLeaves: false, callOuts: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [staffId, setStaffId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const activeStaff = useMemo(
    () => [...staffOptions].sort((a, b) => a.name.localeCompare(b.name)),
    [staffOptions]
  )

  const load = useCallback(
    async (force = false) => {
      const rangeCheck = validateTimeOffDateRange(rangeStart, rangeEnd)
      if ('error' in rangeCheck) {
        setError(rangeCheck.error)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const bundle = await fetchBundle(rangeCheck.startDate, rangeCheck.endDate, {
          includeSickDocuments: true,
          force
        })
        setRows(bundle.sickLeaves)
        setTruncated(bundle.truncated)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    },
    [rangeStart, rangeEnd, fetchBundle]
  )

  useEffect(() => {
    void load()
  }, [load])

  const uploadDocument = async (sickLeaveId: string, staffMemberId: string, file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      throw new Error('Invalid file type. Must be JPEG, PNG, or PDF')
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size must be less than 10MB')
    }
    const docForm = new FormData()
    docForm.append('file', file)
    const res = await fetch(`/api/staff/${staffMemberId}/sick-leave/${sickLeaveId}/documents`, {
      method: 'POST',
      body: docForm
    })
    if (!res.ok) {
      let message = 'Failed to upload document'
      try {
        const data = await res.json()
        if (data?.error) message = data.error
      } catch {
        // keep fallback
      }
      throw new Error(message)
    }
  }

  const handleAdd = async () => {
    if (!staffId || !startDate.trim()) return
    const end = endDate.trim() || startDate.trim()
    if (end < startDate) {
      alert('End date must be on or after start date.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/staff/${staffId}/sick-leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: startDate.trim(), endDate: end, reason })
      })
      if (!res.ok) throw new Error('Failed to save sick leave')
      const created = (await res.json()) as { id: string }
      if (docFile) {
        await uploadDocument(created.id, staffId, docFile)
      }
      setStaffId('')
      setStartDate('')
      setEndDate('')
      setReason('')
      setDocFile(null)
      if (docInputRef.current) docInputRef.current.value = ''
      invalidateBundles()
      await load(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save sick leave')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this sick leave record?')) return
    try {
      const res = await fetch(`/api/staff/sick-leave/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      invalidateBundles()
      await load(true)
    } catch {
      alert('Failed to delete')
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Sick leave periods excuse staff from scheduled shifts. Doctor&apos;s notes can be attached
        when recording leave.
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
          onClick={() => void load(true)}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
        <TimeOffFormHeading accent="rose">Add sick leave</TimeOffFormHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Staff</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Flu"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Doctor&apos;s note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              ref={docInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-rose-50 file:text-rose-700"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!staffId || !startDate || saving}
              onClick={() => void handleAdd()}
              className="w-full px-4 py-2 bg-rose-600 text-white rounded text-sm font-semibold hover:bg-rose-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add sick leave'}
            </button>
          </div>
        </div>
      </div>

      {staffError ? <p className="text-sm text-red-600 mb-4">{staffError}</p> : null}

      {loading || staffLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          <TruncatedNotice truncated={truncated} />
          <TimeOffListHeading count={rows.length}>Sick leave</TimeOffListHeading>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-600 bg-white rounded-lg border border-gray-200 p-5">
              No sick leave in this range.
            </p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Days</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Documents</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rangeLabel =
                  r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`
                return (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      <Link
                        href={`/staff/${r.staffId}`}
                        className="text-blue-700 hover:text-blue-900"
                      >
                        {staffDisplayLabel(r)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{rangeLabel}</td>
                    <td className="px-4 py-2.5 text-gray-700 tabular-nums">
                      {sickLeaveInclusiveDays(r.startDate, r.endDate)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">
                      {r.reason || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.documents && r.documents.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {r.documents.map((doc) => (
                            <a
                              key={doc.id}
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-rose-700 hover:text-rose-900 underline truncate max-w-[10rem]"
                            >
                              {doc.fileName}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          statusColors[r.status] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
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
                  </tr>
                )
              })}
            </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
