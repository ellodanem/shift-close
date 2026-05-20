'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import { MANAGER_HUB_PATH } from '@/lib/manager-hub'
import {
  ROSTER_MOBILE_PATH,
  readStoredRosterView,
  storeRosterView,
  type RosterMobileViewMode
} from '@/lib/roster-mobile'
import {
  addDays,
  buildFullWeekEntries,
  displayStaffForWeek,
  formatInputDate,
  getMonday,
  isOnVacation,
  isPastRosterWeek,
  ROSTER_DAY_LABELS,
  staffDisplayName,
  weekDatesFromStart,
  buildCountByDayAndShift,
  dayShiftCountItems,
  onShiftCountForDay,
  type RosterEntryClient,
  type RosterStaffClient
} from '@/lib/roster-week-client'
import {
  ROSTER_MIN_OFF_DAYS_PER_WEEK_DEFAULT,
  staffIdsBelowMinOffDays,
  countOffDaysForStaffInWeek
} from '@/lib/roster-settings'
import { useAuth } from '@/app/components/AuthContext'

interface ShiftTemplate {
  id: string
  name: string
  startTime: string
  endTime: string
  color?: string | null
}

interface PublicHolidayRow {
  date: string
  name: string
  stationClosed: boolean
}

interface SickLeaveRow {
  staffId: string
  startDate: string
  endDate: string
  status: string
}

function weekDayShort(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`)
  return new Intl.DateTimeFormat('en', { weekday: 'short' }).format(d)
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
}

export default function RosterMobilePage() {
  const router = useRouter()
  const { user, loading: authLoading, logout, canEditRoster } = useAuth()
  const [viewMode, setViewMode] = useState<RosterMobileViewMode>('day')
  const [allStaff, setAllStaff] = useState<RosterStaffClient[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [weekStart, setWeekStart] = useState(() => formatInputDate(getMonday(new Date())))
  const [selectedDate, setSelectedDate] = useState('')
  const [entries, setEntries] = useState<RosterEntryClient[]>([])
  const [publicHolidays, setPublicHolidays] = useState<PublicHolidayRow[]>([])
  const [sickLeaves, setSickLeaves] = useState<SickLeaveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ staffId: string; date: string } | null>(null)
  const [fillStaffId, setFillStaffId] = useState<string | null>(null)
  const [copyConfirm, setCopyConfirm] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [minOffDaysPerWeek, setMinOffDaysPerWeek] = useState(ROSTER_MIN_OFF_DAYS_PER_WEEK_DEFAULT)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageRef = useRef<HTMLDivElement | null>(null)

  const weekDates = useMemo(() => weekDatesFromStart(weekStart), [weekStart])
  const isPastWeek = useMemo(() => isPastRosterWeek(weekStart), [weekStart])
  const readOnly = isPastWeek || !canEditRoster
  const displayStaff = useMemo(
    () => displayStaffForWeek(allStaff, weekStart, entries),
    [allStaff, weekStart, entries]
  )
  const stationClosedDates = useMemo(
    () => new Set(publicHolidays.filter((h) => h.stationClosed).map((h) => h.date)),
    [publicHolidays]
  )

  const countByDayAndShift = useMemo(
    () =>
      buildCountByDayAndShift({
        weekDates,
        entries,
        displayStaffCount: displayStaff.length,
        templates
      }),
    [weekDates, entries, displayStaff.length, templates]
  )

  const selectedDayCoverage = useMemo(() => {
    if (!selectedDate) return { items: [], onShift: 0 }
    const counts = countByDayAndShift.get(selectedDate)
    return {
      items: dayShiftCountItems(counts, templates),
      onShift: onShiftCountForDay(counts)
    }
  }, [selectedDate, countByDayAndShift, templates])

  const selectDay = (ymd: string, switchToDayView = false) => {
    setSelectedDate(ymd)
    if (switchToDayView) switchView('day')
  }

  useEffect(() => {
    setViewMode(readStoredRosterView())
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(ROSTER_MOBILE_PATH)}`)
    }
  }, [authLoading, user, router])

  useEffect(() => {
    void Promise.all([
      fetch('/api/staff').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/roster/templates').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/roster/settings').then((r) => (r.ok ? r.json() : null))
    ]).then(([staff, tmpl, settings]) => {
      setAllStaff(Array.isArray(staff) ? staff : [])
      setTemplates(Array.isArray(tmpl) ? tmpl : [])
      const n = Number(settings?.minOffDaysPerWeek)
      if (Number.isFinite(n)) setMinOffDaysPerWeek(n)
    })
  }, [])

  const loadWeek = useCallback(async () => {
    setLoading(true)
    setError(null)
    const weekEnd = addDays(weekStart, 6)
    try {
      const res = await fetch(
        `/api/roster/week-bundle?weekStart=${weekStart}&weekEnd=${weekEnd}`
      )
      if (!res.ok) {
        setEntries([])
        setPublicHolidays([])
        setSickLeaves([])
        return
      }
      const data = await res.json()
      setEntries(data.entries ?? [])
      setPublicHolidays(Array.isArray(data.publicHolidays) ? data.publicHolidays : [])
      setSickLeaves(Array.isArray(data.sickLeaves) ? data.sickLeaves : [])
    } catch {
      setError('Failed to load roster')
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => {
    void loadWeek()
  }, [loadWeek])

  useEffect(() => {
    if (!selectedDate && weekDates.length) {
      const today = formatInputDate(new Date())
      setSelectedDate(weekDates.includes(today) ? today : weekDates[0])
    }
  }, [weekDates, selectedDate])

  const isOnSickLeave = (staffId: string, date: string) =>
    sickLeaves.some(
      (l) => l.staffId === staffId && l.status !== 'denied' && l.startDate <= date && l.endDate >= date
    )

  const staffBelowMinOff = useMemo(
    () =>
      staffIdsBelowMinOffDays({
        displayStaff,
        weekDates,
        entries,
        stationClosedDates,
        minOffDays: minOffDaysPerWeek,
        isOnSickLeave
      }),
    [displayStaff, weekDates, entries, stationClosedDates, minOffDaysPerWeek, sickLeaves]
  )

  const staffOffDaysWarningTitle = (staff: RosterStaffClient): string | undefined => {
    if (!staffBelowMinOff.has(staff.id) || minOffDaysPerWeek <= 0) return undefined
    const offDays = countOffDaysForStaffInWeek({
      staff,
      weekDates,
      entries,
      stationClosedDates,
      isOnSickLeave
    })
    return `${offDays} off day${offDays === 1 ? '' : 's'} this week (minimum ${minOffDaysPerWeek})`
  }

  const cellBlocked = (staffId: string, date: string) => {
    const staff = allStaff.find((s) => s.id === staffId)
    if (staff && isOnVacation(staff, date)) return 'Vacation'
    if (isOnSickLeave(staffId, date)) return 'Sick leave'
    if (stationClosedDates.has(date)) return 'Station closed'
    return null
  }

  const getEntryFor = (staffId: string, date: string) =>
    entries.find((e) => e.staffId === staffId && e.date === date)

  const templateForEntry = (entry?: RosterEntryClient) =>
    entry?.shiftTemplateId ? templates.find((t) => t.id === entry.shiftTemplateId) : null

  const templateLabel = (entry?: RosterEntryClient) => {
    if (!entry?.shiftTemplateId) return 'Off'
    return templateForEntry(entry)?.name ?? 'Shift'
  }

  const compactCellLabel = (entry?: RosterEntryClient, block?: string | null) => {
    if (block) return '—'
    const name = templateLabel(entry)
    return name.length > 8 ? `${name.slice(0, 7)}…` : name
  }

  const handleSave = async (snapshot: RosterEntryClient[]) => {
    if (readOnly) return
    setSaving(true)
    setError(null)
    try {
      const entriesToSave = buildFullWeekEntries({
        displayStaff,
        weekDates,
        snapshot,
        stationClosedDates
      })
      const res = await fetch('/api/roster/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart, status: 'draft', entries: entriesToSave })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err.error === 'string' ? err.error : 'Failed to save')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const scheduleSave = (next: RosterEntryClient[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => void handleSave(next), 300)
  }

  const setShift = (staffId: string, date: string, shiftTemplateId: string | null) => {
    if (readOnly || cellBlocked(staffId, date)) return
    setEntries((prev) => {
      const existing = prev.find((e) => e.staffId === staffId && e.date === date)
      const next = existing
        ? prev.map((e) => (e === existing ? { ...e, shiftTemplateId } : e))
        : [...prev, { staffId, date, shiftTemplateId, position: null, notes: '' }]
      scheduleSave(next)
      return next
    })
    setPicker(null)
  }

  const fillWeek = (staffId: string, shiftTemplateId: string | null) => {
    if (readOnly) return
    setEntries((prev) => {
      let next = [...prev]
      for (const date of weekDates) {
        if (cellBlocked(staffId, date)) continue
        const existing = next.find((e) => e.staffId === staffId && e.date === date)
        if (existing) {
          next = next.map((e) => (e === existing ? { ...e, shiftTemplateId } : e))
        } else {
          next.push({ staffId, date, shiftTemplateId, position: null, notes: '' })
        }
      }
      scheduleSave(next)
      return next
    })
    setFillStaffId(null)
  }

  const copyPreviousWeek = async () => {
    if (readOnly) return
    setCopyConfirm(false)
    setLoading(true)
    setError(null)
    try {
      const prevStart = addDays(weekStart, -7)
      const res = await fetch(`/api/roster/weeks?weekStart=${prevStart}`)
      if (!res.ok) throw new Error('Failed to load previous week')
      const data = await res.json()
      const prevEntries: RosterEntryClient[] = data.entries ?? []
      if (prevEntries.length === 0) {
        alert('Previous week has no shifts to copy.')
        return
      }
      const prevDates = weekDatesFromStart(prevStart)
      const mapped = new Map<string, string | null>()
      for (const e of prevEntries) {
        const idx = prevDates.indexOf(e.date)
        if (idx === -1) continue
        mapped.set(`${e.staffId}:${weekDates[idx]}`, e.shiftTemplateId ?? null)
      }
      let next = [...entries]
      for (const s of displayStaff) {
        for (const date of weekDates) {
          const key = `${s.id}:${date}`
          if (!mapped.has(key)) continue
          const shiftTemplateId = mapped.get(key) ?? null
          if (cellBlocked(s.id, date)) continue
          const existing = next.find((e) => e.staffId === s.id && e.date === date)
          if (existing) {
            next = next.map((e) => (e === existing ? { ...e, shiftTemplateId } : e))
          } else {
            next.push({ staffId: s.id, date, shiftTemplateId, position: null, notes: '' })
          }
        }
      }
      setEntries(next)
      await handleSave(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to copy week')
    } finally {
      setLoading(false)
    }
  }

  const shareImage = async () => {
    if (!imageRef.current) return
    setSharing(true)
    try {
      const canvas = await html2canvas(imageRef.current, { backgroundColor: '#ffffff', scale: 2, logging: false })
      const dataUrl = canvas.toDataURL('image/png')
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'roster.png', { type: 'image/png' })
      if (isMobileDevice() && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Roster' })
        return
      }
      alert('Save or share is best on a phone with the share sheet. Try again on your device.')
    } catch {
      alert('Failed to generate roster image')
    } finally {
      setSharing(false)
      setMenuOpen(false)
    }
  }

  const switchView = (mode: RosterMobileViewMode) => {
    setViewMode(mode)
    storeRosterView(mode)
  }

  const holidayForDate = (date: string) => publicHolidays.find((h) => h.date === date)

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-16">
      <header className="sticky top-0 z-20 border-b border-slate-700 bg-slate-900/95 backdrop-blur px-4 py-3">
        <div className="max-w-lg mx-auto flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">Roster</h1>
            <p className="text-xs text-slate-400">
              Week {weekStart.slice(8)}/{weekStart.slice(5, 7)}
              {readOnly ? ' · Read only' : saving ? ' · Saving…' : ' · Saved'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link href={MANAGER_HUB_PATH} className="text-xs text-blue-300 px-2 py-1">
              Hub
            </Link>
            <button type="button" onClick={() => setMenuOpen((o) => !o)} className="text-xs text-slate-300 px-2 py-1">
              Menu
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div className="max-w-lg mx-auto mt-2 rounded-lg border border-slate-600 bg-slate-800 py-1 text-sm">
            {canEditRoster && !isPastWeek ? (
              <button
                type="button"
                className="block w-full text-left px-4 py-2.5 hover:bg-slate-700"
                onClick={() => {
                  setMenuOpen(false)
                  setCopyConfirm(true)
                }}
              >
                Copy previous week
              </button>
            ) : null}
            <button
              type="button"
              className="block w-full text-left px-4 py-2.5 hover:bg-slate-700 disabled:opacity-50"
              disabled={sharing || displayStaff.length === 0}
              onClick={() => void shareImage()}
            >
              {sharing ? 'Preparing image…' : 'Share roster image'}
            </button>
            <Link href="/roster" className="block px-4 py-2.5 hover:bg-slate-700 text-slate-200" onClick={() => setMenuOpen(false)}>
              Full roster (desktop)
            </Link>
            <button type="button" className="block w-full text-left px-4 py-2.5 hover:bg-slate-700" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        ) : null}
      </header>

      <main className="max-w-lg mx-auto px-4 pt-3">
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(formatInputDate(getMonday(new Date())))}
            className="flex-1 rounded-lg border border-slate-600 py-2 text-sm font-medium"
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm"
          >
            →
          </button>
        </div>

        {viewMode === 'day' ? (
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
            {weekDates.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => selectDay(d, false)}
                className={`shrink-0 rounded-xl px-3 py-2 border text-center min-w-[3rem] ${
                selectedDate === d ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-600'
              }`}
            >
              <div className="text-[10px] uppercase">{weekDayShort(d)}</div>
              <div className="text-sm font-bold">{d.slice(8)}</div>
            </button>
          ))}
          </div>
        ) : null}

        <div className="flex rounded-lg border border-slate-600 overflow-hidden mb-4">
          <button
            type="button"
            onClick={() => switchView('week')}
            className={`flex-1 py-2 text-xs sm:text-sm font-medium ${viewMode === 'week' ? 'bg-blue-600' : 'bg-slate-800'}`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => switchView('day')}
            className={`flex-1 py-2 text-xs sm:text-sm font-medium ${viewMode === 'day' ? 'bg-blue-600' : 'bg-slate-800'}`}
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => switchView('staff')}
            className={`flex-1 py-2 text-xs sm:text-sm font-medium ${viewMode === 'staff' ? 'bg-blue-600' : 'bg-slate-800'}`}
          >
            Person
          </button>
        </div>

        {viewMode === 'week' ? (
          <div
            className="mb-3 min-h-[2.75rem] rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-1.5 flex items-center"
            aria-live="polite"
          >
            {selectedDate && selectedDayCoverage.items.length > 0 ? (
              <div className="flex items-center gap-2 w-full min-w-0">
                <span className="text-[10px] font-semibold text-slate-400 shrink-0 tabular-nums">
                  {weekDayShort(selectedDate)}
                </span>
                <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0">
                  {selectedDayCoverage.items.map((item) => (
                    <span
                      key={item.key}
                      className={`shrink-0 inline-flex items-center gap-0.5 rounded-md border px-2 py-1 text-[10px] font-semibold tabular-nums ${
                        item.key === 'off'
                          ? 'border-slate-600 bg-slate-900/50 text-slate-400'
                          : 'border-slate-600 text-slate-100'
                      }`}
                      style={
                        item.color && item.key !== 'off'
                          ? { backgroundColor: `${item.color}28`, borderLeftColor: item.color, borderLeftWidth: 2 }
                          : undefined
                      }
                    >
                      {item.label}
                      <span className="opacity-80">×{item.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : selectedDate ? (
              <p className="text-[10px] text-slate-500 w-full text-center">
                {weekDayShort(selectedDate)} — no shift assignments yet
              </p>
            ) : (
              <p className="text-[10px] text-slate-500 w-full text-center">Tap a column for shift counts</p>
            )}
          </div>
        ) : null}

        {viewMode === 'day' && selectedDate ? (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800 px-3 py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-slate-100">
                {weekDayShort(selectedDate)} {selectedDate.slice(8)}/{selectedDate.slice(5, 7)}
              </p>
              <p className="text-xs text-slate-400 shrink-0">
                {selectedDayCoverage.onShift} on shift · {displayStaff.length} staff
              </p>
            </div>
            {selectedDayCoverage.items.length === 0 ? (
              <p className="text-xs text-slate-500">No shift assignments for this day yet.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
                {selectedDayCoverage.items.map((item) => (
                  <span
                    key={item.key}
                    className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold tabular-nums ${
                      item.key === 'off'
                        ? 'border-slate-600 bg-slate-900/50 text-slate-400'
                        : 'border-slate-600 text-slate-100'
                    }`}
                    style={
                      item.color && item.key !== 'off'
                        ? { backgroundColor: `${item.color}28`, borderLeftColor: item.color, borderLeftWidth: 3 }
                        : undefined
                    }
                  >
                    {item.label}
                    <span className="opacity-80">×{item.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-300 mb-3">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-slate-400">Loading roster…</p>
        ) : viewMode === 'day' && selectedDate ? (
          <>
            {holidayForDate(selectedDate) ? (
              <p className="text-xs text-amber-300 mb-2">
                {holidayForDate(selectedDate)!.name}
                {holidayForDate(selectedDate)!.stationClosed ? ' (station closed)' : ''}
              </p>
            ) : null}
            <ul className="space-y-2">
              {displayStaff.map((s) => {
                const entry = getEntryFor(s.id, selectedDate)
                const block = cellBlocked(s.id, selectedDate)
                return (
                  <li key={s.id} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-3">
                    <div className="flex justify-between gap-2 items-center">
                      <p
                        className={`font-medium ${
                          staffBelowMinOff.has(s.id) ? 'roster-staff-off-days-warning' : ''
                        }`}
                        title={staffOffDaysWarningTitle(s)}
                      >
                        {staffDisplayName(s)}
                      </p>
                      <button
                        type="button"
                        disabled={!!block || readOnly}
                        onClick={() => setPicker({ staffId: s.id, date: selectedDate })}
                        className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm min-h-[44px] disabled:opacity-50"
                      >
                        {block ?? templateLabel(entry)}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        ) : viewMode === 'week' ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
            <p className="text-[11px] text-slate-500 px-3 py-2 border-b border-slate-700">
              Swipe for all days · tap name to fill week · tap cell to edit · tap column for counts
            </p>
            <div className="overflow-x-auto">
              <table className="w-max min-w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-900/80">
                    <th className="sticky left-0 z-10 bg-slate-800 border-b border-r border-slate-700 px-2 py-2 text-left font-semibold text-slate-400 min-w-[4.5rem]">
                      Staff
                    </th>
                    {weekDates.map((date, i) => {
                      const hol = holidayForDate(date)
                      const dayOnShift = onShiftCountForDay(countByDayAndShift.get(date))
                      return (
                        <th
                          key={date}
                          className={`border-b border-slate-700 px-1 py-2 text-center font-semibold min-w-[3.25rem] cursor-pointer ${
                            selectedDate === date
                              ? 'bg-blue-900/40 text-blue-200 ring-1 ring-inset ring-blue-500'
                              : 'text-slate-300'
                          }`}
                          title={hol?.name ? `${hol.name} — tap for shift breakdown` : 'Tap for shift breakdown'}
                          onClick={() => selectDay(date, false)}
                        >
                          <div>{ROSTER_DAY_LABELS[i]}</div>
                          <div className="text-[10px] text-slate-500">{date.slice(8)}</div>
                          <div className={`text-[10px] font-bold tabular-nums mt-0.5 ${
                            selectedDate === date ? 'text-blue-300' : 'text-emerald-400/90'
                          }`}>
                            {dayOnShift > 0 ? dayOnShift : '—'}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayStaff.map((s) => (
                    <tr key={s.id} className="border-b border-slate-700/80 last:border-0">
                      <td
                        className={`sticky left-0 z-10 bg-slate-800 border-r border-slate-700 p-0.5 font-medium text-slate-100 whitespace-nowrap max-w-[5rem] ${
                          staffBelowMinOff.has(s.id) ? 'roster-staff-off-days-warning' : ''
                        }`}
                      >
                        {canEditRoster && !isPastWeek ? (
                          <button
                            type="button"
                            onClick={() => setFillStaffId(s.id)}
                            className="w-full min-h-[40px] px-1.5 py-1.5 text-left truncate rounded-md text-blue-200 hover:bg-slate-700/80 active:bg-slate-700"
                            title={
                              staffOffDaysWarningTitle(s) ??
                              `${staffDisplayName(s)} — tap to fill entire week`
                            }
                          >
                            {s.firstName?.trim() || s.name.split(' ')[0]}
                          </button>
                        ) : (
                          <span
                            className="block px-1.5 py-1.5 truncate"
                            title={staffOffDaysWarningTitle(s) ?? staffDisplayName(s)}
                          >
                            {s.firstName?.trim() || s.name.split(' ')[0]}
                          </span>
                        )}
                      </td>
                      {weekDates.map((date) => {
                        const entry = getEntryFor(s.id, date)
                        const block = cellBlocked(s.id, date)
                        const tmpl = templateForEntry(entry)
                        return (
                          <td key={date} className="p-0.5">
                            <button
                              type="button"
                              disabled={!!block || readOnly}
                              title={block ?? templateLabel(entry)}
                              onClick={() => setPicker({ staffId: s.id, date })}
                              className="w-full min-w-[3.25rem] min-h-[40px] rounded-md border border-slate-600/80 px-0.5 py-1 text-center font-medium disabled:opacity-50"
                              style={{
                                backgroundColor: tmpl?.color ? `${tmpl.color}22` : undefined,
                                borderLeftColor: tmpl?.color || undefined,
                                borderLeftWidth: tmpl?.color ? 3 : undefined
                              }}
                            >
                              {compactCellLabel(entry, block)}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {displayStaff.map((s) => (
              <li key={s.id} className="rounded-xl border border-slate-700 bg-slate-800 p-3">
                <div className="flex justify-between items-center mb-2">
                  <p
                    className={`font-medium ${
                      staffBelowMinOff.has(s.id) ? 'roster-staff-off-days-warning' : ''
                    }`}
                    title={staffOffDaysWarningTitle(s)}
                  >
                    {staffDisplayName(s)}
                  </p>
                  {canEditRoster && !isPastWeek ? (
                    <button
                      type="button"
                      className="text-xs text-blue-300"
                      onClick={() => setFillStaffId(s.id)}
                    >
                      Fill week
                    </button>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {weekDates.map((date) => {
                    const entry = getEntryFor(s.id, date)
                    const block = cellBlocked(s.id, date)
                    return (
                      <div key={date} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-slate-400 w-10">{ROSTER_DAY_LABELS[weekDates.indexOf(date)]}</span>
                        <button
                          type="button"
                          disabled={!!block || readOnly}
                          onClick={() => setPicker({ staffId: s.id, date })}
                          className="flex-1 text-left rounded-md border border-slate-600 px-2 py-2 min-h-[44px] disabled:opacity-50"
                        >
                          {block ?? templateLabel(entry)}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {picker ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setPicker(null)}>
          <div
            className="bg-slate-800 border-t border-slate-600 rounded-t-2xl w-full max-w-lg p-4 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-slate-400 mb-3">Choose shift</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-600 py-3 font-medium"
                onClick={() => setShift(picker.staffId, picker.date, null)}
              >
                Off
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="rounded-xl border border-slate-600 py-3 font-medium text-left px-3"
                  style={{ borderLeftColor: t.color || '#64748b', borderLeftWidth: 4 }}
                  onClick={() => setShift(picker.staffId, picker.date, t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {fillStaffId ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setFillStaffId(null)}>
          <div className="bg-slate-800 rounded-t-2xl w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-slate-400 mb-1">Fill entire week</p>
            <p className="text-base font-semibold text-slate-100 mb-3">
              {staffDisplayName(displayStaff.find((s) => s.id === fillStaffId) ?? { name: 'Staff' })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border border-slate-600 py-3" onClick={() => fillWeek(fillStaffId, null)}>
                Off
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="rounded-xl border border-slate-600 py-3"
                  onClick={() => fillWeek(fillStaffId, t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {copyConfirm ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setCopyConfirm(false)}>
          <div className="bg-slate-800 rounded-xl p-5 max-w-sm w-full border border-slate-600" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold mb-2">Copy previous week?</p>
            <p className="text-sm text-slate-400 mb-4">Replaces this week&apos;s assignments with the prior week (same weekdays).</p>
            <div className="flex gap-2">
              <button type="button" className="flex-1 py-2 rounded-lg border border-slate-600" onClick={() => setCopyConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="flex-1 py-2 rounded-lg bg-blue-600 font-semibold" onClick={() => void copyPreviousWeek()}>
                Copy
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed -left-[9999px] top-0" aria-hidden>
        <div ref={imageRef} className="bg-white text-black p-3 text-[10px]">
          <p className="font-bold mb-2">Roster week {weekStart}</p>
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-300 px-1">Staff</th>
                {ROSTER_DAY_LABELS.map((d) => (
                  <th key={d} className="border border-gray-300 px-1">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayStaff.map((s) => (
                <tr key={s.id}>
                  <td
                    className={`border border-gray-300 px-1 whitespace-nowrap ${
                      staffBelowMinOff.has(s.id) ? 'roster-staff-off-days-warning' : ''
                    }`}
                    title={staffOffDaysWarningTitle(s)}
                  >
                    {staffDisplayName(s)}
                  </td>
                  {weekDates.map((date) => (
                    <td key={date} className="border border-gray-300 px-1">
                      {templateLabel(getEntryFor(s.id, date))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
