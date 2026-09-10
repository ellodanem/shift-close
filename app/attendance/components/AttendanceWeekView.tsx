'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  currentWeekMonday,
  weekStartMondayFromDate,
  addDays
} from '@/lib/roster-week-client'
import type {
  AttendanceWeekViewCell,
  AttendanceWeekViewPayload,
  WeekViewCellKind
} from '@/lib/attendance-week-view'

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function formatDaySub(ymd: string): string {
  const [, m, d] = ymd.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mi = Number(m) - 1
  return `${Number(d)} ${months[mi] ?? m}`
}

function cellStyles(kind: WeekViewCellKind): { wrap: string; letter: string; label: string } {
  switch (kind) {
    case 'present':
      return { wrap: 'bg-emerald-50 text-emerald-800', letter: 'P', label: 'Present' }
    case 'late':
      return { wrap: 'bg-orange-50 text-orange-800', letter: 'L', label: 'Late' }
    case 'absent':
      return { wrap: 'bg-rose-50 text-rose-800', letter: 'A', label: 'Absent' }
    case 'pending':
      return { wrap: 'bg-slate-50 text-slate-600', letter: '…', label: 'Pending' }
    case 'vacation':
      return { wrap: 'bg-teal-50 text-teal-800', letter: 'V', label: 'Vacation' }
    case 'day_off':
      return { wrap: 'bg-sky-50 text-sky-800', letter: 'D', label: 'Day off' }
    case 'sick':
      return { wrap: 'bg-rose-50 text-rose-800', letter: 'S', label: 'Sick' }
    case 'excused':
      return { wrap: 'bg-sky-50 text-sky-800', letter: 'E', label: 'Excused' }
    default:
      return { wrap: 'bg-slate-50/80 text-slate-400 border border-slate-100', letter: '', label: 'No shift' }
  }
}

function WeekCell({ cell }: { cell: AttendanceWeekViewCell }) {
  const s = cellStyles(cell.kind)
  if (cell.kind === 'no_shift') {
    return (
      <div className="min-h-[88px] rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-2 text-[11px] text-slate-400">
        No shift
      </div>
    )
  }
  return (
    <div className={`min-h-[88px] rounded-lg px-2 py-1.5 ${s.wrap}`}>
      <div className="flex items-center gap-1">
        <span className="flex h-4 w-4 items-center justify-center rounded bg-white/70 text-[10px] font-bold">
          {s.letter}
        </span>
        <span className="text-[11px] font-semibold">{s.label}</span>
      </div>
      {cell.shiftName ? (
        <div className="mt-0.5 truncate text-[10px] opacity-80">{cell.shiftName}</div>
      ) : null}
      <div className="mt-1 space-y-0.5">
        {cell.punches.map((p, i) => (
          <div
            key={`${p.time}-${i}`}
            className={`tabular-nums text-[10px] ${
              p.late ? 'text-orange-700' : p.type === 'out' ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {p.time} {p.type}
          </div>
        ))}
      </div>
      {cell.note ? <div className="mt-0.5 text-[10px] opacity-80">{cell.note}</div> : null}
    </div>
  )
}

export default function AttendanceWeekView() {
  const [weekStart, setWeekStart] = useState(() => currentWeekMonday())
  const [data, setData] = useState<AttendanceWeekViewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async (start: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/attendance/week-view?weekStart=${encodeURIComponent(start)}`, {
        cache: 'no-store'
      })
      const json = (await res.json().catch(() => ({}))) as AttendanceWeekViewPayload & { error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to load week view')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load week view')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(weekStart)
  }, [weekStart, load])

  const staff = (data?.staff ?? []).filter((row) => {
    if (!showArchived && row.status !== 'active') return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return row.staffName.toLowerCase().includes(q) || row.staffFirstName.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee"
          className="h-9 min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived staff
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(currentWeekMonday())}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900"
        >
          This week
        </button>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          Next →
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Jump to
          <input
            type="date"
            value={weekStart}
            onChange={(e) => {
              const v = e.target.value
              if (v) setWeekStart(weekStartMondayFromDate(v))
            }}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
        </label>
        {(data?.irregularityCount ?? 0) > 0 ? (
          <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
            {data!.irregularityCount} irregularit{data!.irregularityCount === 1 ? 'y' : 'ies'} this week
          </span>
        ) : null}
        {(data?.otAlertCount ?? 0) > 0 ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            {data!.otAlertCount} OT alert{data!.otAlertCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-slate-500">Loading week view…</p>
      ) : data && !data.enabled ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Present/absence is turned off in Attendance settings.
        </p>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-[9.5rem] px-2 py-2 text-left">Staff</th>
                  {(data?.weekDates ?? []).map((d, i) => (
                    <th key={d} className="px-1 py-2 text-center">
                      {DAY_LABELS[i]}
                      <div className="normal-case font-medium text-slate-400">{formatDaySub(d)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((row) => (
                  <tr key={row.staffId}>
                    <td className="px-2 py-1 align-top">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white">
                          {initials(row.staffName)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium leading-tight text-slate-900">
                            {row.staffFirstName}
                          </div>
                          <div className="truncate text-[11px] capitalize text-slate-500">
                            {row.role.replace(/_/g, ' ')}
                          </div>
                          <div className="text-[11px] tabular-nums text-slate-400">
                            {row.weekWorkedHours.toFixed(1)}h worked
                          </div>
                        </div>
                      </div>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.date} className="px-1 py-1 align-top">
                        <WeekCell cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {staff.length === 0 && !loading ? (
              <p className="px-2 py-8 text-center text-sm text-slate-500">No staff for this week.</p>
            ) : null}
            <p className="mt-2 px-1 text-[11px] text-slate-400">
              Late after {data?.lateMinutes ?? 10} min, absent after {data?.absentMinutes ?? 60} min with no
              in-punch. OT alerts use worked hours over 40 for the week.
            </p>
          </div>
          <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-3 lg:w-56">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Staff this week
            </div>
            {staff.map((row) => (
              <div key={row.staffId} className="flex items-center justify-between gap-2 py-1.5">
                <span className="truncate text-sm text-slate-800">{row.staffName}</span>
                {row.irregularDayCount > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                    {row.irregularDayCount}
                  </span>
                ) : row.otAlert ? (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                    OT
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    OK
                  </span>
                )}
              </div>
            ))}
          </aside>
        </div>
      )}
    </div>
  )
}
