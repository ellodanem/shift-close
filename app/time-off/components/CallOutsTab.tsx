'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import CallOutCalledAtFields from '@/app/components/CallOutCalledAtFields'
import { useAuth } from '@/app/components/AuthContext'
import {
  buildCallOutTooltip,
  combineCalledAtParts,
  defaultCalledAtPartsForWorkDate,
  formatCalledAtLocal,
  normalizeCallOutDate,
  sickLeaveCoversDate,
  type CalledAtParts
} from '@/lib/call-outs'
import { addCalendarDaysYmd, businessTodayYmd, formatDateOnlyForDisplay } from '@/lib/datetime-policy'
import type { TimeOffCallOutRow, TimeOffSickLeaveRow } from '@/lib/time-off-bundle'
import { TIME_OFF_MAX_RANGE_DAYS, validateTimeOffDateRange } from '@/lib/time-off-range'
import { useTimeOff } from '../TimeOffProvider'
import { staffDisplayLabel } from './staff-label'
import { TimeOffDayHeading, TimeOffFormHeading, TimeOffListHeading } from './time-off-headings'
import TruncatedNotice from './TruncatedNotice'

type ListFilter = 'all' | 'thisMonth' | 'lastMonth' | 'custom'

/** Default "All" filter span (within server max range). */
const ALL_MAX_DAYS = 120

type CallOutsTabProps = {
  initialDate?: string | null
}

function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}

function monthEndYmdFromMonthStart(monthStart: string): string {
  const [y, m] = monthStart.split('-').map((x) => parseInt(x, 10))
  const nextMonth =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return addCalendarDaysYmd(nextMonth, -1)
}

function getThisMonthRange(today: string): { start: string; end: string } {
  const start = monthStartYmd(today)
  return { start, end: monthEndYmdFromMonthStart(start) }
}

function getLastMonthRange(today: string): { start: string; end: string } {
  const thisStart = monthStartYmd(today)
  const end = addCalendarDaysYmd(thisStart, -1)
  return { start: monthStartYmd(end), end }
}

function resolveCallOutListRange(
  filter: ListFilter,
  today: string,
  customStart: string,
  customEnd: string
): { start: string; end: string; label: string } {
  if (filter === 'all') {
    return {
      start: addCalendarDaysYmd(today, -ALL_MAX_DAYS),
      end: today,
      label: 'the last 120 days'
    }
  }
  if (filter === 'thisMonth') {
    const { start, end } = getThisMonthRange(today)
    return { start, end, label: 'this month' }
  }
  if (filter === 'lastMonth') {
    const { start, end } = getLastMonthRange(today)
    return { start, end, label: 'last month' }
  }
  const start = customStart.trim() || addCalendarDaysYmd(today, -30)
  const endRaw = customEnd.trim() || today
  const end = endRaw < start ? start : endRaw
  return {
    start,
    end,
    label: `${formatDateOnlyForDisplay(start)} – ${formatDateOnlyForDisplay(end)}`
  }
}

function callOutMatchesSearch(row: TimeOffCallOutRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const label = staffDisplayLabel(row).toLowerCase()
  const fullName = row.staffName.toLowerCase()
  const first = row.staffFirstName?.trim().toLowerCase() ?? ''
  const notes = row.notes?.trim().toLowerCase() ?? ''
  return (
    label.includes(q) ||
    fullName.includes(q) ||
    (first.length > 0 && first.includes(q)) ||
    notes.includes(q)
  )
}

function pillClass(active: boolean): string {
  return `px-4 py-2 rounded font-semibold text-sm transition-colors ${
    active ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
  }`
}

export default function CallOutsTab({ initialDate }: CallOutsTabProps) {
  const { canLogCallOut } = useAuth()
  const { staffOptions, staffLoading, staffError, fetchBundle, invalidateBundles } = useTimeOff()
  const today = businessTodayYmd()
  const initialDay = useMemo(() => {
    if (!initialDate) return today
    return normalizeCallOutDate(initialDate) ?? today
  }, [initialDate, today])

  const [activeFilter, setActiveFilter] = useState<ListFilter>('thisMonth')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [rows, setRows] = useState<TimeOffCallOutRow[]>([])
  const [sickLeaves, setSickLeaves] = useState<TimeOffSickLeaveRow[]>([])
  const [truncated, setTruncated] = useState({ dayOffs: false, sickLeaves: false, callOuts: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [logStaffId, setLogStaffId] = useState('')
  const [logDate, setLogDate] = useState(initialDay)
  const [logNotes, setLogNotes] = useState('')
  const [logCalledAtParts, setLogCalledAtParts] = useState<CalledAtParts>(() =>
    defaultCalledAtPartsForWorkDate(initialDay)
  )
  const [saving, setSaving] = useState(false)

  const listRange = useMemo(
    () => resolveCallOutListRange(activeFilter, today, customStart, customEnd),
    [activeFilter, today, customStart, customEnd]
  )

  const activeStaff = useMemo(
    () => [...staffOptions].sort((a, b) => a.name.localeCompare(b.name)),
    [staffOptions]
  )

  const load = useCallback(
    async (rangeOverride?: { start: string; end: string }, force = false) => {
      const start = rangeOverride?.start ?? listRange.start
      const end = rangeOverride?.end ?? listRange.end
      const rangeCheck = validateTimeOffDateRange(start, end, TIME_OFF_MAX_RANGE_DAYS)
      if ('error' in rangeCheck) {
        setError(rangeCheck.error)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const bundle = await fetchBundle(rangeCheck.startDate, rangeCheck.endDate, { force })
        setRows(bundle.callOuts)
        setSickLeaves(bundle.sickLeaves)
        setTruncated(bundle.truncated)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    },
    [listRange.start, listRange.end, fetchBundle]
  )

  useEffect(() => {
    if (!initialDate) return
    const normalized = normalizeCallOutDate(initialDate)
    if (!normalized) return
    const { start, end } = getThisMonthRange(today)
    if (normalized < start || normalized > end) {
      setActiveFilter('custom')
      setShowCustomPicker(true)
      setCustomStart(normalized)
      setCustomEnd(normalized > today ? normalized : today)
    }
  }, [initialDate, today])

  useEffect(() => {
    setLogDate(initialDay)
    setLogCalledAtParts(defaultCalledAtPartsForWorkDate(initialDay))
  }, [initialDay])

  useEffect(() => {
    if (activeFilter === 'custom' && (!customStart.trim() || !customEnd.trim())) {
      return
    }
    void load()
  }, [load, activeFilter, customStart, customEnd])

  const filteredRows = useMemo(
    () => rows.filter((r) => callOutMatchesSearch(r, searchQuery)),
    [rows, searchQuery]
  )

  const groupedByDay = useMemo(() => {
    const byDate = new Map<string, TimeOffCallOutRow[]>()
    for (const r of filteredRows) {
      const dayRows = byDate.get(r.date) ?? []
      dayRows.push(r)
      byDate.set(r.date, dayRows)
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dayRows]) => ({ date, rows: dayRows }))
  }, [filteredRows])

  const sickOverlap = (row: TimeOffCallOutRow) =>
    sickLeaves.some((sl) => sl.staffId === row.staffId && sickLeaveCoversDate(sl, row.date))

  const ensureSavedDateVisible = (workDate: string): { start: string; end: string } => {
    let { start, end } = listRange
    if (workDate < start || workDate > end) {
      setActiveFilter('custom')
      setShowCustomPicker(true)
      const nextStart = workDate < start ? workDate : start
      const nextEnd = workDate > end ? workDate : end
      setCustomStart(nextStart)
      setCustomEnd(nextEnd)
      return { start: nextStart, end: nextEnd }
    }
    return { start, end }
  }

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
      setLogCalledAtParts(defaultCalledAtPartsForWorkDate(logDate))
      const range = ensureSavedDateVisible(logDate)
      invalidateBundles()
      await load(range, true)
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
      invalidateBundles()
      await load(undefined, true)
    } catch {
      alert('Failed to delete')
    }
  }

  const rangeLabel = listRange.label

  const renderDayTable = (dayRows: TimeOffCallOutRow[]) => (
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
        {dayRows.map((r) => {
          const overlap = sickOverlap(r)
          return (
            <tr key={r.id} className="border-b border-gray-100 last:border-0">
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
  )

  const listToolbar = (
    <div className="mb-4 flex flex-wrap items-center gap-3 justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveFilter('all')
            setShowCustomPicker(false)
          }}
          className={pillClass(activeFilter === 'all')}
          title={`Last ${ALL_MAX_DAYS} days`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveFilter('thisMonth')
            setShowCustomPicker(false)
          }}
          className={pillClass(activeFilter === 'thisMonth')}
        >
          This Month
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveFilter('lastMonth')
            setShowCustomPicker(false)
          }}
          className={pillClass(activeFilter === 'lastMonth')}
        >
          Last Month
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveFilter('custom')
            setShowCustomPicker(true)
            if (!customStart) setCustomStart(addCalendarDaysYmd(today, -30))
            if (!customEnd) setCustomEnd(today)
          }}
          className={pillClass(activeFilter === 'custom')}
        >
          Custom
        </button>
        {showCustomPicker && activeFilter === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 ml-1">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <span className="text-sm text-gray-500">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        ) : null}
      </div>
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Staff name or note…"
        className="w-full min-w-[12rem] max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  )

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Phone call log for staff who will not work a scheduled day. Does not change hours or pay
        period — shown on the roster. Sick leave entered later can overlap the same dates.
      </p>

      {canLogCallOut ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
          <TimeOffFormHeading accent="teal">Log call out</TimeOffFormHeading>
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
                onChange={(e) => {
                  const nextDate = e.target.value
                  setLogDate(nextDate)
                  if (nextDate) {
                    setLogCalledAtParts((prev) => ({ ...prev, date: nextDate }))
                  }
                }}
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

      {listToolbar}

      {staffError ? <p className="text-sm text-red-600 mb-4">{staffError}</p> : null}

      {loading || staffLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : activeFilter === 'custom' && (!customStart.trim() || !customEnd.trim()) ? (
        <p className="text-sm text-gray-600 bg-white rounded-lg border border-gray-200 p-5">
          Choose a start and end date for the custom range.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600 bg-white rounded-lg border border-gray-200 p-5">
          No call outs in {rangeLabel}.
          {activeFilter === 'all' ? ` (All shows the last ${ALL_MAX_DAYS} days.)` : null}
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-gray-600 bg-white rounded-lg border border-gray-200 p-5">
          No call outs matching &ldquo;{searchQuery.trim()}&rdquo; in {rangeLabel}.
        </p>
      ) : (
        <div className="space-y-6">
          <TruncatedNotice truncated={truncated} />
          <TimeOffListHeading count={filteredRows.length}>Call outs</TimeOffListHeading>
          {groupedByDay.map(({ date, rows: dayRows }) => (
            <section key={date}>
              <TimeOffDayHeading>{formatDateOnlyForDisplay(date)}</TimeOffDayHeading>
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {renderDayTable(dayRows)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
