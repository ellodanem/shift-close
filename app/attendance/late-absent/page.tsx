'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  currentBiweeklyPeriodBounds,
  previousBiweeklyPeriodBounds
} from '@/lib/current-pay-period'
import { lateAbsentReportToCsv, type LateAbsentReport, type LateAbsentStaffRow } from '@/lib/late-absent-report-shared'

function statusClass(status: string): string {
  switch (status) {
    case 'late':
      return 'bg-amber-100 text-amber-900'
    case 'absent':
      return 'bg-red-100 text-red-900'
    case 'present':
      return 'bg-emerald-100 text-emerald-900'
    case 'excused':
      return 'bg-violet-100 text-violet-900'
    case 'pending':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function shiftBadgeStyle(color: string | null): { backgroundColor: string; color: string } | undefined {
  const raw = color?.trim()
  if (!raw) return undefined
  let hex = raw
  const short = /^#?([0-9a-f]{3})$/i.exec(raw)
  const full = /^#?([0-9a-f]{6})$/i.exec(raw)
  if (short) {
    const [r, g, b] = short[1].split('')
    hex = `${r}${r}${g}${g}${b}${b}`
  } else if (full) {
    hex = full[1]
  } else {
    return { backgroundColor: raw, color: '#111827' }
  }
  const n = parseInt(hex, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const luminance = (r * 299 + g * 587 + b * 114) / 1000
  return { backgroundColor: `#${hex}`, color: luminance > 155 ? '#111827' : '#ffffff' }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'late':
      return 'Late'
    case 'absent':
      return 'Absent'
    case 'present':
      return 'On time'
    case 'excused':
      return 'Excused'
    case 'pending':
      return 'Pending'
    case 'off':
      return 'Off'
    default:
      return status
  }
}

export default function LateAbsentReportPage() {
  const current = useMemo(() => currentBiweeklyPeriodBounds(), [])
  const previous = useMemo(() => previousBiweeklyPeriodBounds(), [])
  const [startDate, setStartDate] = useState(current.periodStart)
  const [endDate, setEndDate] = useState(current.periodEnd)
  const [preset, setPreset] = useState<'current' | 'previous' | 'custom'>('current')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<LateAbsentReport | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ startDate: start, endDate: end })
      const res = await fetch(`/api/attendance/late-absent-report?${params}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setReport(data as LateAbsentReport)
      setSelectedId(null)
    } catch (e) {
      setReport(null)
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(current.periodStart, current.periodEnd)
  }, [current.periodEnd, current.periodStart, load])

  const applyPreset = (next: 'current' | 'previous' | 'custom') => {
    setPreset(next)
    if (next === 'current') {
      setStartDate(current.periodStart)
      setEndDate(current.periodEnd)
      void load(current.periodStart, current.periodEnd)
    } else if (next === 'previous') {
      setStartDate(previous.periodStart)
      setEndDate(previous.periodEnd)
      void load(previous.periodStart, previous.periodEnd)
    }
  }

  const selected: LateAbsentStaffRow | null =
    report && selectedId ? report.rows.find((r) => r.staffId === selectedId) ?? null : null

  const exportCsv = () => {
    if (!report) return
    const blob = new Blob([lateAbsentReportToCsv(report)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `late-absent-${report.startDate}-to-${report.endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Late & Absent Summary</h1>
            <p className="text-sm text-gray-600 mt-1">
              Counts of late punches and no-shows for rostered staff.
              {report
                ? ` Late after ${report.lateMinutes} min · Absent after ${report.absentMinutes} min · ${report.timeZone}.`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/attendance"
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700 text-sm"
            >
              ← Attendance
            </Link>
            <Link
              href="/attendance/staff-report"
              className="px-4 py-2 border border-gray-300 bg-white rounded font-semibold hover:bg-gray-50 text-sm"
            >
              Staff attendance
            </Link>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!report}
              className="px-4 py-2 border border-indigo-600 text-indigo-800 bg-white rounded font-semibold hover:bg-indigo-50 text-sm disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-1">
              {(
                [
                  { id: 'current' as const, label: 'This period' },
                  { id: 'previous' as const, label: 'Last period' },
                  { id: 'custom' as const, label: 'Custom' }
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`px-3 py-1.5 text-sm rounded border ${
                    preset === p.id
                      ? 'border-slate-700 bg-slate-700 text-white'
                      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Start
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setPreset('custom')
                  setStartDate(e.target.value)
                }}
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                End
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setPreset('custom')
                  setEndDate(e.target.value)
                }}
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void load(startDate, endDate)}
              disabled={loading}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Run'}
            </button>
          </div>
        </div>

        {error ? <p className="text-sm text-red-700 mb-4">{error}</p> : null}

        {report ? (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums text-amber-800">{report.lateTotal}</div>
              <div className="text-xs uppercase tracking-wide text-gray-500">Late</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums text-red-800">{report.absentTotal}</div>
              <div className="text-xs uppercase tracking-wide text-gray-500">Absent</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums text-gray-900">
                {report.staffWithIncidents}
              </div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Staff with incidents ({report.staffReviewed} rostered)
              </div>
            </div>
          </div>
        ) : null}

        {selected ? (
          <div className="bg-white rounded-lg border border-gray-200 mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-sm text-blue-700 hover:text-blue-900"
                >
                  ← All staff
                </button>
                <h2 className="text-lg font-semibold text-gray-900 mt-1">{selected.staffName}</h2>
                <p className="text-sm text-gray-600">
                  {report?.periodLabel} · {selected.lateCount} late · {selected.absentCount} absent
                </p>
              </div>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Shift</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Punch</th>
                  <th className="px-4 py-2">After start</th>
                </tr>
              </thead>
              <tbody>
                {selected.days.map((d) => (
                  <tr key={d.dateYmd} className="border-b border-gray-100">
                    <td className="px-4 py-2 text-gray-900">{d.dateLabel}</td>
                    <td className="px-4 py-2">
                      <span
                        className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold"
                        style={shiftBadgeStyle(d.shiftColor) ?? { backgroundColor: '#e5e7eb', color: '#111827' }}
                      >
                        {d.shiftName} {d.shiftStartTime}
                        {d.shiftEndTime ? `–${d.shiftEndTime}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${statusClass(d.status)}`}
                      >
                        {statusLabel(d.status)}
                      </span>
                      {d.note ? <span className="ml-2 text-xs text-gray-500">{d.note}</span> : null}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-gray-800">
                      {d.punchTimeLabel ?? (d.status === 'absent' ? 'No punch' : '—')}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-gray-800">
                      {d.minutesAfterStart == null
                        ? '—'
                        : `${d.minutesAfterStart > 0 ? '+' : ''}${d.minutesAfterStart}m`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">By staff</h2>
              <p className="text-xs text-gray-500 mt-0.5">Click a row for day and shift detail.</p>
            </div>
            {loading && !report ? (
              <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>
            ) : !report || report.rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-600">
                No late or absent incidents for rostered staff in this period.
              </p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2">Staff</th>
                    <th className="px-4 py-2">Late</th>
                    <th className="px-4 py-2">Absent</th>
                    <th className="px-4 py-2">Total</th>
                    <th className="px-4 py-2">Last incident</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr
                      key={r.staffId}
                      className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                      onClick={() => setSelectedId(r.staffId)}
                    >
                      <td className="px-4 py-2 font-medium text-gray-900">{r.staffName}</td>
                      <td className="px-4 py-2 tabular-nums text-amber-800">{r.lateCount}</td>
                      <td className="px-4 py-2 tabular-nums text-red-800">{r.absentCount}</td>
                      <td className="px-4 py-2 tabular-nums font-semibold text-gray-900">{r.total}</td>
                      <td className="px-4 py-2 text-gray-600">{r.lastIncidentLabel ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-500">
          Late = first punch after {report?.lateMinutes ?? 15} min past shift start. Absent = scheduled day with no
          punch by {report?.absentMinutes ?? 60} min. Vacation, sick leave, approved day off, and call-outs are
          excused.
        </p>
      </div>
    </div>
  )
}
