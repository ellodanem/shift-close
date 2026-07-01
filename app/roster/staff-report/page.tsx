'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  printStaffRosterReport,
  type StaffRosterReportViewMode
} from '@/lib/staff-roster-report-print'
import {
  formatShiftTimesDisplay,
  staffRosterStatusLabel,
  weekColumnHeaders,
  type StaffRosterDayStatus,
  type StaffRosterReport,
  type StaffRosterReportDay
} from '@/lib/staff-roster-report'

const VIEW_STORAGE_KEY = 'staff-roster-report-view'

interface StaffOption {
  id: string
  name: string
}

function defaultEndYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultStartYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() - 27)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readStoredViewMode(): StaffRosterReportViewMode {
  if (typeof window === 'undefined') return 'week'
  const v = window.sessionStorage.getItem(VIEW_STORAGE_KEY)
  return v === 'list' ? 'list' : 'week'
}

function statusBadgeClass(status: StaffRosterDayStatus): string {
  switch (status) {
    case 'working':
      return 'bg-emerald-100 text-emerald-900'
    case 'off':
      return 'bg-gray-100 text-gray-700'
    case 'unassigned':
      return 'bg-gray-50 text-gray-500 border border-dashed border-gray-300'
    case 'vacation':
      return 'bg-violet-100 text-violet-900'
    case 'sick':
      return 'bg-purple-100 text-purple-900'
    case 'day_off':
      return 'bg-fuchsia-100 text-fuchsia-900'
    case 'station_closed':
      return 'bg-amber-100 text-amber-900'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function weekStatusBadgeClass(status: StaffRosterReport['weeks'][number]['rosterStatus']): string {
  switch (status) {
    case 'published':
      return 'bg-emerald-100 text-emerald-800'
    case 'draft':
      return 'bg-amber-100 text-amber-800'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function weekStatusLabel(status: StaffRosterReport['weeks'][number]['rosterStatus']): string {
  switch (status) {
    case 'published':
      return 'Published'
    case 'draft':
      return 'Draft'
    default:
      return 'No roster'
  }
}

function WeekCell({ day }: { day: StaffRosterReportDay }) {
  const times = formatShiftTimesDisplay(day)
  const borderStyle =
    day.status === 'working' && day.shiftColor
      ? { borderLeftColor: day.shiftColor, borderLeftWidth: 3 }
      : undefined

  if (day.status === 'working' && day.shiftName) {
    return (
      <td
        className="p-2 align-top border border-gray-200 min-w-[4.5rem] bg-white"
        style={borderStyle}
      >
        <div className="font-semibold text-gray-900 text-sm">{day.shiftName}</div>
        {times && <div className="text-[10px] text-gray-500 mt-0.5 tabular-nums">{times}</div>}
      </td>
    )
  }

  if (day.status === 'off') {
    return (
      <td className="p-2 align-top border border-gray-200 bg-gray-100 text-gray-600 text-sm font-medium">
        Off
      </td>
    )
  }

  if (day.status === 'vacation') {
    return (
      <td className="p-2 align-top border border-gray-200 bg-violet-50 text-violet-900 text-sm">
        <div className="font-semibold">Vacation</div>
        {day.rosterShiftName && (
          <div className="text-[10px] text-violet-700 mt-0.5">{day.rosterShiftName}</div>
        )}
      </td>
    )
  }

  if (day.status === 'sick') {
    return (
      <td className="p-2 align-top border border-gray-200 bg-purple-50 text-purple-900 text-sm">
        <div className="font-semibold">Sick</div>
        {day.rosterShiftName && (
          <div className="text-[10px] text-purple-700 mt-0.5">{day.rosterShiftName}</div>
        )}
      </td>
    )
  }

  if (day.status === 'day_off') {
    return (
      <td className="p-2 align-top border border-gray-200 bg-fuchsia-50 text-fuchsia-900 text-sm font-semibold">
        Day off
      </td>
    )
  }

  if (day.status === 'station_closed') {
    return (
      <td className="p-2 align-top border border-gray-200 bg-amber-50 text-amber-900 text-sm font-semibold">
        Closed
      </td>
    )
  }

  return (
    <td className="p-2 align-top border border-dashed border-gray-300 text-gray-400 text-center text-sm">
      —
    </td>
  )
}

function StaffRosterReportInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [staffId, setStaffId] = useState(() => searchParams.get('staffId') ?? '')
  const [startDate, setStartDate] = useState(() => searchParams.get('startDate') ?? defaultStartYmd())
  const [endDate, setEndDate] = useState(() => searchParams.get('endDate') ?? defaultEndYmd())
  const [publishedOnly, setPublishedOnly] = useState(true)
  const [viewMode, setViewMode] = useState<StaffRosterReportViewMode>('week')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [presetHint, setPresetHint] = useState<string | null>(null)
  const [report, setReport] = useState<StaffRosterReport | null>(null)
  const skipUrlAutoloadRef = useRef(false)

  useEffect(() => {
    setViewMode(readStoredViewMode())
  }, [])

  const setViewModePersisted = (mode: StaffRosterReportViewMode) => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(VIEW_STORAGE_KEY, mode)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/staff', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as Array<{ id: string; name: string; status?: string }>
        const list = Array.isArray(data)
          ? data
              .filter((s) => (s.status ?? 'active') === 'active')
              .map((s) => ({ id: s.id, name: s.name }))
              .sort((a, b) => a.name.localeCompare(b.name))
          : []
        setStaffList(list)
      } catch {
        // ignore
      }
    })()
  }, [])

  const fetchReport = useCallback(
    async (sid: string, start: string, end: string, pubOnly: boolean) => {
      const params = new URLSearchParams({
        staffId: sid,
        startDate: start,
        endDate: end,
        publishedOnly: pubOnly ? '1' : '0'
      })
      const res = await fetch(`/api/roster/staff-report?${params}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : 'Failed to load report')
      }
      return body as StaffRosterReport
    },
    []
  )

  const loadReport = useCallback(
    async (overrides?: {
      staffId?: string
      startDate?: string
      endDate?: string
      publishedOnly?: boolean
    }) => {
      const sid = overrides?.staffId ?? staffId
      const start = overrides?.startDate ?? startDate
      const end = overrides?.endDate ?? endDate
      const pubOnly = overrides?.publishedOnly ?? publishedOnly

      if (!sid) {
        setError('Select a staff member')
        return
      }

      if (overrides?.startDate) setStartDate(overrides.startDate)
      if (overrides?.endDate) setEndDate(overrides.endDate)
      if (overrides?.publishedOnly !== undefined) setPublishedOnly(overrides.publishedOnly)

      setLoading(true)
      setError(null)
      setReport(null)
      try {
        const data = await fetchReport(sid, start, end, pubOnly)
        setReport(data)
        const p = new URLSearchParams({ staffId: sid, startDate: start, endDate: end })
        skipUrlAutoloadRef.current = true
        router.replace(`/roster/staff-report?${p.toString()}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load report')
      } finally {
        setLoading(false)
      }
    },
    [staffId, startDate, endDate, publishedOnly, fetchReport, router]
  )

  useEffect(() => {
    if (skipUrlAutoloadRef.current) {
      skipUrlAutoloadRef.current = false
      return
    }
    const qStaff = searchParams.get('staffId')
    const qStart = searchParams.get('startDate')
    const qEnd = searchParams.get('endDate')
    if (!qStaff || !qStart || !qEnd) return
    setStaffId(qStaff)
    setStartDate(qStart)
    setEndDate(qEnd)
    void loadReport({ staffId: qStaff, startDate: qStart, endDate: qEnd })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL-driven autoload
  }, [searchParams])

  const applyLastFourWeeks = () => {
    const end = defaultEndYmd()
    const start = defaultStartYmd()
    setStartDate(start)
    setEndDate(end)
    setPresetHint('Using the last 4 weeks.')
    if (!staffId) {
      setPresetHint('Using the last 4 weeks. Select a staff member, then Generate.')
      return
    }
    void loadReport({ staffId, startDate: start, endDate: end })
  }

  const weekCount = report?.weeks.length ?? 0
  const longRangeHint = useMemo(() => {
    if (!report || viewMode !== 'week') return null
    if (weekCount > 6) return 'Long range — list view may be easier to scan.'
    return null
  }, [report, viewMode, weekCount])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff roster report</h1>
            <p className="text-sm text-gray-600 mt-1">
              Scheduled shifts for one person over a date range.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/roster"
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700 text-sm"
            >
              ← Roster
            </Link>
            <Link
              href="/attendance/staff-report"
              className="px-4 py-2 border border-indigo-600 text-indigo-800 bg-white rounded font-semibold hover:bg-indigo-50 text-sm"
            >
              Attendance report
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[12rem] flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Staff</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Select staff…</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={applyLastFourWeeks}
              disabled={loading}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-60"
            >
              Last 4 weeks
            </button>
            <button
              type="button"
              onClick={() => {
                setPresetHint(null)
                void loadReport()
              }}
              disabled={loading || !staffId}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-60 text-sm"
            >
              {loading ? 'Loading…' : 'Generate'}
            </button>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={publishedOnly}
              onChange={(e) => setPublishedOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Published weeks only
          </label>
          {presetHint && (
            <p className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-3 py-2">
              {presetHint}
            </p>
          )}
          {error && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {report && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{report.staffName}</h2>
                <p className="text-sm text-gray-600 mt-1">{report.periodLabel}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {report.publishedOnly ? 'Published weeks only' : 'Includes draft weeks'}
                  {weekCount > 0 && ` · ${weekCount} week${weekCount === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                  <button
                    type="button"
                    onClick={() => setViewModePersisted('week')}
                    className={`px-3 py-1.5 font-medium ${
                      viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewModePersisted('list')}
                    className={`px-3 py-1.5 font-medium border-l border-gray-300 ${
                      viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    List
                  </button>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Scheduled shifts
                  </div>
                  <div className="text-3xl font-bold tabular-nums text-gray-900">
                    {report.scheduledShiftCount}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">work days</div>
                  <button
                    type="button"
                    onClick={() => printStaffRosterReport(report, viewMode)}
                    className="mt-3 px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 font-medium"
                  >
                    Print
                  </button>
                </div>
              </div>
            </div>

            {report.periodSummaryLine && (
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Period summary: </span>
                {report.periodSummaryLine}
              </div>
            )}

            {longRangeHint && (
              <p className="px-6 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-100">
                {longRangeHint}
              </p>
            )}

            {viewMode === 'week' ? (
              <div className="p-6 space-y-6">
                <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-400" />
                    Working
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-gray-200" />
                    Off
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm border border-dashed border-gray-400" />
                    Unassigned
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-violet-200" />
                    Vacation / sick
                  </span>
                </div>
                {report.weeks.map((week) => (
                  <div key={week.weekStart} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900">{week.weekLabel}</h3>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${weekStatusBadgeClass(week.rosterStatus)}`}
                      >
                        {weekStatusLabel(week.rosterStatus)}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-white border-b border-gray-200">
                            {weekColumnHeaders(week.weekStart, report.startDate, report.endDate).map(
                              (h) => (
                                <th
                                  key={h}
                                  className="px-2 py-2 text-center text-xs font-semibold text-gray-600"
                                >
                                  {h}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {week.days.map((d) => (
                              <WeekCell key={d.dateYmd} day={d} />
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
                      {week.summaryLine}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Date</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Day</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Scheduled</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Times</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.days.map((d) => (
                      <tr key={d.dateYmd} className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{d.dateLabel}</td>
                        <td className="px-4 py-2 text-gray-600">{d.dayShort}</td>
                        <td className="px-4 py-2">
                          {d.shiftName ? (
                            <span
                              className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200"
                              style={
                                d.shiftColor
                                  ? { borderLeftColor: d.shiftColor, borderLeftWidth: 3 }
                                  : undefined
                              }
                            >
                              {d.shiftName}
                            </span>
                          ) : d.rosterShiftName ? (
                            <span className="text-xs text-gray-400">
                              — <span className="text-gray-500">(roster: {d.rosterShiftName})</span>
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-700 tabular-nums text-xs">
                          {formatShiftTimesDisplay(d) ?? '—'}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusBadgeClass(d.status)}`}
                          >
                            {staffRosterStatusLabel(d.status)}
                          </span>
                          {d.statusNote && (
                            <div className="text-xs text-gray-500 mt-0.5 max-w-[14rem]">{d.statusNote}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function StaffRosterReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 text-gray-600">Loading report…</div>
      }
    >
      <StaffRosterReportInner />
    </Suspense>
  )
}
