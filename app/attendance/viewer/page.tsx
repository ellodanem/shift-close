'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ATTENDANCE_VIEWER_PATH,
  canAccessAttendanceViewer,
  formatPunchTimeLocal,
  formatViewerDateLabel
} from '@/lib/attendance-viewer'
import { useAuth } from '@/app/components/AuthContext'
import { shouldRefetchOnVisibility } from '@/lib/refetch-on-visibility'

interface SummaryCounts {
  present: number
  late: number
  absent: number
  pending: number
  off: number
  scheduled: number
}

interface WeekDay {
  date: string
  scheduledCount: number
  summary: SummaryCounts
  isToday: boolean
}

interface StaffRow {
  staffId: string
  staffName: string
  staffFirstName: string
  shiftName: string
  shiftColor: string | null
  shiftStartTime: string
  status: string
  lateReason: string
  manualPresent: boolean
  manualAbsent: boolean
  punchExempt: boolean
  lastIn: string | null
  lastOut: string | null
}

interface PunchRow {
  id: string
  punchTime: string
  punchType: 'in' | 'out'
  staffId: string | null
  staffName: string
  source: string
}

interface ViewerPayload {
  enabled: boolean
  date: string
  todayYmd: string
  stationTimeZone: string
  weekStart: string
  weekDays: WeekDay[]
  summary: SummaryCounts
  rows: StaffRow[]
  recentPunches: PunchRow[]
}

function statusLabel(s: string) {
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

function statusClass(s: string) {
  switch (s) {
    case 'present':
      return 'text-emerald-800 bg-emerald-50 border-emerald-200'
    case 'late':
      return 'text-amber-900 bg-amber-50 border-amber-200'
    case 'absent':
      return 'text-red-800 bg-red-50 border-red-200'
    case 'pending':
      return 'text-slate-700 bg-slate-50 border-slate-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

function weekDayShort(ymd: string, tz: string) {
  try {
    const d = new Date(`${ymd}T12:00:00`)
    return new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: tz }).format(d)
  } catch {
    return ymd.slice(8)
  }
}

function issueCount(s: SummaryCounts) {
  return s.absent + s.late
}

export default function AttendanceViewerPage() {
  const router = useRouter()
  const { user, loading: authLoading, logout } = useAuth()
  const canView = user ? canAccessAttendanceViewer(user.role) : false
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [data, setData] = useState<ViewerPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedOpen, setFeedOpen] = useState(true)
  const [punchDetail, setPunchDetail] = useState<PunchRow | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const tabHiddenAtRef = useRef<number | null>(null)

  const load = useCallback(async (ymd?: string) => {
    setError(null)
    setLoading(true)
    try {
      const q = ymd ? `?date=${encodeURIComponent(ymd)}` : ''
      const res = await fetch(`/api/attendance/viewer-summary${q}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to load')
      }
      const payload = json as ViewerPayload
      setData(payload)
      setSelectedDate(payload.date)
      setUpdatedAt(new Date())
      setFeedOpen(payload.date === payload.todayYmd)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(ATTENDANCE_VIEWER_PATH)}`)
      return
    }
    if (!canView) {
      router.replace('/dashboard')
    }
  }, [authLoading, user, canView, router])

  useEffect(() => {
    if (!user || !canView) return
    void load(selectedDate ?? undefined)
  }, [user, canView, selectedDate, load])

  useEffect(() => {
    if (!user || !canView || !selectedDate) return
    let cancelled = false
    let lastHint = ''

    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/attendance/logs/sync-hint', { cache: 'no-store' })
        const hint = await res.json()
        if (!res.ok || cancelled) return
        const tick = [
          hint.newestNonExtractedCreatedAt,
          hint.newestCorrectedAt,
          hint.stationTodayYmd,
          hint.payPeriodTick
        ].join('|')
        if (lastHint && tick !== lastHint) {
          await load(selectedDate)
        }
        lastHint = tick
      } catch {
        // ignore poll errors
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now()
        return
      }
      if (
        document.visibilityState === 'visible' &&
        shouldRefetchOnVisibility(tabHiddenAtRef.current)
      ) {
        tabHiddenAtRef.current = null
        void load(selectedDate)
      }
    }

    const id = window.setInterval(() => void poll(), 120_000)
    void poll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, canView, selectedDate, load])

  const tz = data?.stationTimeZone ?? ''
  const isToday = data ? data.date === data.todayYmd : false

  const headerDate = useMemo(() => {
    if (!data?.date || !tz) return ''
    return formatViewerDateLabel(data.date, tz)
  }, [data?.date, tz])

  if (authLoading || (!user && !error)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <p className="text-sm text-slate-300">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-700/80 bg-slate-900/95 backdrop-blur px-4 py-3">
        <div className="flex items-start justify-between gap-3 max-w-lg mx-auto">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Attendance</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {headerDate || '—'}
              {updatedAt ? ` · Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/dashboard"
              className="text-xs font-medium text-blue-300 hover:text-blue-200 px-2 py-1 rounded-md hover:bg-slate-800"
            >
              Full app
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="text-xs font-medium text-slate-300 hover:text-white px-2 py-1 rounded-md hover:bg-slate-800"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-10 pt-4">
        {data?.weekDays?.length ? (
          <div className="mb-4 -mx-1 overflow-x-auto pb-1">
            <div className="flex gap-1.5 min-w-max px-1">
              {data.weekDays.map((d) => {
                const selected = d.date === data.date
                const issues = issueCount(d.summary)
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setSelectedDate(d.date)}
                    className={`flex flex-col items-center rounded-xl px-3 py-2 min-w-[3.25rem] border transition-colors ${
                      selected
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
                      {weekDayShort(d.date, tz)}
                    </span>
                    <span className="text-sm font-bold tabular-nums">{d.date.slice(8)}</span>
                    {d.scheduledCount > 0 ? (
                      <span
                        className={`mt-1 text-[10px] font-medium tabular-nums ${
                          selected ? 'text-blue-100' : issues > 0 ? 'text-amber-400' : 'text-slate-500'
                        }`}
                      >
                        {issues > 0 ? `${issues} issue${issues === 1 ? '' : 's'}` : d.scheduledCount}
                      </span>
                    ) : (
                      <span className="mt-1 text-[10px] text-slate-500">—</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => void load(selectedDate ?? undefined)}
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-600 bg-slate-800 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {loading && !data ? (
          <p className="text-sm text-slate-400">Loading attendance…</p>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : !data?.enabled ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-sm text-slate-300">
            Present / absent tracking is turned off. Enable it in the full app under Attendance → Settings.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {(
                [
                  ['Present', data.summary.present, 'text-emerald-300'],
                  ['Late', data.summary.late, 'text-amber-300'],
                  ['Absent', data.summary.absent, 'text-red-300']
                ] as const
              ).map(([label, n, color]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-center"
                >
                  <p className={`text-xl font-bold tabular-nums ${color}`}>{n}</p>
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>

            <section className="mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Scheduled ({data.rows.length})
              </h2>
              {data.rows.length === 0 ? (
                <p className="text-sm text-slate-400">No one scheduled this day.</p>
              ) : (
                <ul className="space-y-2">
                  {data.rows.map((r) => (
                    <li
                      key={r.staffId}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-100">
                            {r.staffFirstName || r.staffName}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: r.shiftColor || '#64748b' }}
                            />
                            {r.shiftName}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass(r.status)}`}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 tabular-nums">
                        In {r.lastIn ? formatPunchTimeLocal(r.lastIn, tz) : '—'}
                        {' · '}
                        Out {r.lastOut ? formatPunchTimeLocal(r.lastOut, tz) : '—'}
                      </p>
                      {(r.manualPresent || r.manualAbsent || r.punchExempt || r.lateReason) && (
                        <p className="text-[11px] text-slate-500 mt-1 truncate" title={r.lateReason}>
                          {r.lateReason ||
                            (r.manualAbsent
                              ? 'Marked absent'
                              : r.manualPresent
                                ? 'Manual present'
                                : r.punchExempt
                                  ? 'Punch exempt'
                                  : '')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <button
                type="button"
                onClick={() => setFeedOpen((o) => !o)}
                className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2"
              >
                <span>Recent punches ({data.recentPunches.length})</span>
                <span>{feedOpen ? '▼' : '▶'}</span>
              </button>
              {feedOpen ? (
                data.recentPunches.length === 0 ? (
                  <p className="text-sm text-slate-500">No punches recorded this day.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.recentPunches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setPunchDetail(p)}
                          className="w-full rounded-lg border border-slate-700/80 bg-slate-800/80 px-3 py-2.5 text-left hover:bg-slate-750 flex items-center gap-3"
                        >
                          <span className="text-sm font-mono tabular-nums text-slate-300 w-12 shrink-0">
                            {formatPunchTimeLocal(p.punchTime, tz)}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase w-9 shrink-0 ${
                              p.punchType === 'in' ? 'text-emerald-400' : 'text-sky-400'
                            }`}
                          >
                            {p.punchType}
                          </span>
                          <span className="text-sm font-medium text-slate-100 truncate flex-1">
                            {p.staffName}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
              {!isToday && feedOpen ? (
                <p className="text-[11px] text-slate-500 mt-2">Historical day — feed is read-only.</p>
              ) : null}
            </section>
          </>
        )}
      </main>

      {punchDetail ? (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => setPunchDetail(null)}
        >
          <div
            className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">{punchDetail.staffName}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Time</dt>
                <dd className="text-slate-100 font-mono tabular-nums">
                  {tz
                    ? new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: tz
                      }).format(new Date(punchDetail.punchTime))
                    : punchDetail.punchTime}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Type</dt>
                <dd className="text-slate-100 uppercase font-semibold">{punchDetail.punchType}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Source</dt>
                <dd className="text-slate-100 text-right break-all">{punchDetail.source}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setPunchDetail(null)}
              className="mt-5 w-full rounded-lg bg-slate-700 py-2 text-sm font-semibold text-white hover:bg-slate-600"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
