'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconCallOut } from '@/app/components/IconDropdown'
import { buildCallOutTooltip } from '@/lib/call-outs'
import { printStaffAttendanceReport } from '@/lib/staff-attendance-report-print'
import type { StaffAttendanceReport, StaffAttendanceReportDay } from '@/lib/staff-attendance-report'

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
  d.setDate(d.getDate() - 13)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** First calendar day after a YYYY-MM-DD date (matches pay-period last-sent-cutoff). */
function dayAfterYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function statusBadgeClass(status: StaffAttendanceReportDay['status']): string {
  switch (status) {
    case 'present':
      return 'bg-emerald-100 text-emerald-900'
    case 'absent':
      return 'bg-red-100 text-red-900'
    case 'excused':
      return 'bg-violet-100 text-violet-900'
    case 'off':
      return 'bg-gray-100 text-gray-700'
    case 'pending':
      return 'bg-amber-100 text-amber-900'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function statusLabel(status: StaffAttendanceReportDay['status']): string {
  switch (status) {
    case 'present':
      return 'Present'
    case 'absent':
      return 'Absent'
    case 'excused':
      return 'Excused'
    case 'off':
      return 'Off'
    case 'pending':
      return 'Pending'
    default:
      return status
  }
}

function StaffAttendanceReportInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [staffId, setStaffId] = useState(() => searchParams.get('staffId') ?? '')
  const [startDate, setStartDate] = useState(() => searchParams.get('startDate') ?? defaultStartYmd())
  const [endDate, setEndDate] = useState(() => searchParams.get('endDate') ?? defaultEndYmd())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [presetHint, setPresetHint] = useState<string | null>(null)
  const [report, setReport] = useState<StaffAttendanceReport | null>(null)
  /** Skip one searchParams-driven load after loadReport updates the URL. */
  const skipUrlAutoloadRef = useRef(false)

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

  /** Default Start = day after last filed pay period end (unless URL already has startDate). */
  useEffect(() => {
    if (searchParams.get('startDate')) return
    void (async () => {
      try {
        const res = await fetch('/api/attendance/pay-period?latestSaved=1', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { lastFiledPeriod?: { endDate: string } | null }
        const end = data.lastFiledPeriod?.endDate
        if (end) setStartDate(dayAfterYmd(end))
      } catch {
        // keep defaultStartYmd fallback
      }
    })()
  }, [searchParams])

  const fetchReport = useCallback(
    async (sid: string, start: string, end: string) => {
      const params = new URLSearchParams({ staffId: sid, startDate: start, endDate: end })
      const res = await fetch(`/api/attendance/staff-report?${params}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : 'Failed to load report')
      }
      return body as StaffAttendanceReport
    },
    []
  )

  const loadReport = useCallback(
    async (overrides?: { staffId?: string; startDate?: string; endDate?: string }) => {
      const sid = overrides?.staffId ?? staffId
      const start = overrides?.startDate ?? startDate
      const end = overrides?.endDate ?? endDate

      if (!sid) {
        setError('Select a staff member')
        return
      }

      if (overrides?.startDate) setStartDate(overrides.startDate)
      if (overrides?.endDate) setEndDate(overrides.endDate)

      setLoading(true)
      setError(null)
      setReport(null)
      try {
        const data = await fetchReport(sid, start, end)
        setReport(data)
        const p = new URLSearchParams({ staffId: sid, startDate: start, endDate: end })
        skipUrlAutoloadRef.current = true
        router.replace(`/attendance/staff-report?${p.toString()}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load report')
      } finally {
        setLoading(false)
      }
    },
    [staffId, startDate, endDate, fetchReport, router]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when URL query changes, not when loadReport identity changes
  }, [searchParams])

  const summary = useMemo(() => {
    if (!report) return null
    const scheduled = report.days.filter((d) => d.status === 'present' || d.status === 'absent' || d.status === 'pending')
    const absent = report.days.filter((d) => d.status === 'absent').length
    const irregular = report.days.filter((d) => d.punchQuality === 'irregular').length
    return { absent, irregular, scheduledDays: scheduled.length }
  }, [report])

  const applyPayPeriodPreset = async () => {
    setPresetHint(null)
    setError(null)

    let start = defaultStartYmd()
    let end = defaultEndYmd()
    let hint = 'No saved pay period yet — using the last 14 days.'

    try {
      const res = await fetch('/api/attendance/pay-period?latestSaved=1', { cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as {
          lastFiledPeriod?: { startDate: string; endDate: string } | null
        }
        const lp = data.lastFiledPeriod
        if (lp?.startDate && lp?.endDate) {
          start = lp.startDate
          end = lp.endDate
          hint = `Using last filed pay period (${start} through ${end}).`
        }
      }
    } catch {
      // keep fallback range + hint
    }

    setStartDate(start)
    setEndDate(end)
    setPresetHint(hint)

    if (!staffId) {
      setPresetHint(`${hint} Select a staff member, then Generate.`)
      return
    }

    await loadReport({ staffId, startDate: start, endDate: end })
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff attendance report</h1>
            <p className="text-sm text-gray-600 mt-1">
              Daily present/absent, clock times, and hours for one person over a date range.
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
              href="/attendance/pay-period"
              className="px-4 py-2 border border-indigo-600 text-indigo-800 bg-white rounded font-semibold hover:bg-indigo-50 text-sm"
            >
              Pay period
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
              onClick={() => void applyPayPeriodPreset()}
              disabled={loading}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-60"
              title="Fill dates from the last saved pay period and generate when staff is selected"
            >
              Last filed pay period
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
          {presetHint && (
            <p className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-3 py-2">
              {presetHint}
            </p>
          )}
          {error && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</p>
          )}
        </div>

        {report && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{report.staffName}</h2>
                <p className="text-sm text-gray-600 mt-1">{report.periodLabel}</p>
                {summary && (
                  <p className="text-xs text-gray-500 mt-2">
                    {summary.absent > 0 && (
                      <span className="mr-3">
                        {summary.absent} absent day{summary.absent === 1 ? '' : 's'}
                      </span>
                    )}
                    {summary.irregular > 0 && (
                      <span className="text-red-700">
                        {summary.irregular} day{summary.irregular === 1 ? '' : 's'} with irregular punches
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Period total</div>
                <div className="text-3xl font-bold tabular-nums text-gray-900">
                  {report.punchExempt ? '—' : report.periodTotalHours.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {report.punchExempt ? 'No clock (salaried)' : 'hours'}
                </div>
                {!report.punchExempt && (
                  <p className="text-xs text-gray-500 mt-2 max-w-[14rem] ml-auto">
                    First {report.expectedPunchesPerDay} punches per day only (Attendance settings).
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => printStaffAttendanceReport(report)}
                  className="mt-3 px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 font-medium"
                >
                  Print
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Date</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Clock in / out</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((d) => (
                    <tr key={d.dateYmd} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{d.dateLabel}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusBadgeClass(d.status)}`}
                          >
                            {statusLabel(d.status)}
                          </span>
                          {d.callOut && (
                            <span
                              className="inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-amber-600 text-white shadow-sm ring-1 ring-amber-900/25 select-none"
                              title={buildCallOutTooltip({
                                calledAt: d.callOut.calledAt,
                                notes: d.callOut.notes,
                                recordedByLabel: d.callOut.recordedByLabel,
                                sickLeaveOverlap: d.callOut.sickLeaveOverlap
                              })}
                              role="img"
                              aria-label="Call out"
                            >
                              <IconCallOut size={9} />
                            </span>
                          )}
                        </div>
                        {d.statusNote && (
                          <div className="text-xs text-gray-500 mt-0.5 max-w-[14rem]">{d.statusNote}</div>
                        )}
                        {d.shiftName && d.status !== 'off' && (
                          <div className="text-xs text-gray-400 mt-0.5">{d.shiftName}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {d.punches.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {d.punches.map((p, i) => (
                              <li key={i} className="tabular-nums">
                                <span className="font-medium">{p.timeLabel}</span>{' '}
                                <span
                                  className={
                                    p.punchType === 'in'
                                      ? 'text-emerald-700 text-xs font-medium'
                                      : 'text-amber-800 text-xs font-medium'
                                  }
                                >
                                  {p.punchType === 'in' ? 'In' : 'Out'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {d.punchQuality === 'irregular' && (
                          <p className="text-xs text-red-600 mt-1 font-medium">Irregular punches — hours may be wrong</p>
                        )}
                        {d.punchQuality === 'short_ok' && (
                          <p className="text-xs text-sky-700 mt-1">Possible missed punch</p>
                        )}
                        {d.excludedPunchCount > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            +{d.excludedPunchCount} later punch{d.excludedPunchCount === 1 ? '' : 'es'} not
                            counted
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">
                        {report.punchExempt ? '—' : d.hours.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-gray-900">
                      Period total
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {report.punchExempt ? '—' : report.periodTotalHours.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function StaffAttendanceReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 text-gray-600">Loading report…</div>
      }
    >
      <StaffAttendanceReportInner />
    </Suspense>
  )
}
