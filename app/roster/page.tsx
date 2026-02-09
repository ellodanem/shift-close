'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'

interface Staff {
  id: string
  name: string
  firstName?: string
  status: string
  role: string
  vacationStart?: string | null
  vacationEnd?: string | null
}

function isOnVacation(staff: Staff, date: string): boolean {
  const start = staff.vacationStart
  const end = staff.vacationEnd
  return !!(start && end && date >= start && date <= end)
}

interface ShiftTemplate {
  id: string
  name: string
  startTime: string
  endTime: string
  color?: string | null
}

interface RosterEntry {
  id?: string
  rosterWeekId?: string
  staffId: string
  date: string // YYYY-MM-DD
  shiftTemplateId: string | null
  position?: string | null
  notes?: string | null
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7 // Sunday=0 → 7
  if (day !== 1) {
    d.setDate(d.getDate() - (day - 1))
  }
  d.setHours(0, 0, 0, 0)
  return d
}

function formatInputDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  date.setDate(date.getDate() + days)
  return formatInputDate(date)
}

function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  // dd-mm-yy
  return `${d}-${m}-${y.slice(2)}`
}

const monthNames: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
}

function ordinal(n: number): string {
  const s = String(n)
  if (s.endsWith('11') || s.endsWith('12') || s.endsWith('13')) return `${n}th`
  if (s.endsWith('1')) return `${n}st`
  if (s.endsWith('2')) return `${n}nd`
  if (s.endsWith('3')) return `${n}rd`
  return `${n}th`
}

function formatPrettyDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  const day = parseInt(d, 10)
  const month = monthNames[m] || m
  const year = y.slice(2)
  return `${ordinal(day)} ${month} ${year}`
}

const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : ''
  )

export default function RosterPage() {
  const router = useRouter()
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [weekStart, setWeekStart] = useState<string>(() =>
    formatInputDate(getMonday(new Date()))
  )
  const [entries, setEntries] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageRef = useRef<HTMLDivElement | null>(null)

  const weekDates = useMemo(
    () => dayLabels.map((_, idx) => addDays(weekStart, idx)),
    [weekStart]
  )

  // Week banner colour: past = grey, current = light green, future = light blue
  const weekBannerStyle = useMemo(() => {
    const thisWeekMonday = formatInputDate(getMonday(new Date()))
    if (weekStart < thisWeekMonday) return { bg: 'bg-gray-200', text: 'text-gray-700' }
    if (weekStart > thisWeekMonday) return { bg: 'bg-sky-100', text: 'text-sky-900' }
    return { bg: 'bg-green-100', text: 'text-green-900' }
  }, [weekStart])

  // For past weeks: show active staff + inactive staff who have entries this week (so past rosters are preserved)
  const displayStaff = useMemo(() => {
    const thisWeekMonday = formatInputDate(getMonday(new Date()))
    const activeForRoster = allStaff.filter(
      (s) => s.status === 'active' && s.role !== 'manager'
    )
    if (weekStart >= thisWeekMonday) return activeForRoster
    const entryStaffIds = new Set(entries.map((e) => e.staffId))
    const inactiveWithEntries = allStaff.filter(
      (s) =>
        s.status !== 'active' &&
        s.role !== 'manager' &&
        entryStaffIds.has(s.id)
    )
    return [...activeForRoster, ...inactiveWithEntries]
  }, [allStaff, weekStart, entries])

  // Load staff and templates once
  useEffect(() => {
    async function loadStatic() {
      try {
        const [staffRes, tmplRes] = await Promise.all([
          fetch('/api/staff'),
          fetch('/api/roster/templates')
        ])
        if (staffRes.ok) {
          const staffData: Staff[] = await staffRes.json()
          setAllStaff(staffData)
        }
        if (tmplRes.ok) {
          const tmplData: ShiftTemplate[] = await tmplRes.json()
          setTemplates(tmplData)
        }
      } catch (err) {
        console.error('Error loading roster static data', err)
        setError('Failed to load staff or shift presets.')
      }
    }
    loadStatic()
  }, [])

  // Load roster entries whenever weekStart changes
  useEffect(() => {
    async function loadWeek() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/roster/weeks?weekStart=${weekStart}`)
        if (!res.ok) {
          if (res.status === 400) {
            // No week yet is fine – show empty grid
            setEntries([])
          } else {
            console.error('Failed to fetch roster week', res.status)
            setError('Failed to load roster for this week.')
          }
          return
        }
        const data = await res.json()
        const loadedEntries: RosterEntry[] = data.entries || []
        setEntries(loadedEntries)
      } catch (err) {
        console.error('Error loading roster week', err)
        setError('Failed to load roster for this week.')
      } finally {
        setLoading(false)
      }
    }
    loadWeek()
  }, [weekStart])

  const getEntryFor = (staffId: string, date: string): RosterEntry | undefined =>
    entries.find((e) => e.staffId === staffId && e.date === date)

  const getTemplateForEntry = (entry?: RosterEntry) =>
    entry?.shiftTemplateId
      ? templates.find((t) => t.id === entry.shiftTemplateId) || null
      : null

  // Per-day, per-shift running counts (updates as assignments change)
  const countByDayAndShift = useMemo(() => {
    const byDay = new Map<string, Map<string, number>>()
    weekDates.forEach((date) => {
      const dayEntries = entries.filter((e) => e.date === date)
      const shiftCounts = new Map<string, number>()
      templates.forEach((t) => shiftCounts.set(t.id, 0))
      shiftCounts.set('off', 0)
      dayEntries.forEach((e) => {
        const key = e.shiftTemplateId ?? 'off'
        shiftCounts.set(key, (shiftCounts.get(key) ?? 0) + 1)
      })
      const assigned = dayEntries.length
      shiftCounts.set('off', displayStaff.length - assigned)
      byDay.set(date, shiftCounts)
    })
    return byDay
  }, [entries, weekDates, displayStaff.length, templates])

  const handleMoveStaff = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= displayStaff.length) return
    const reordered = [...displayStaff]
    const a = reordered[index]
    const b = reordered[newIndex]
    reordered[index] = b
    reordered[newIndex] = a
    const orderedIds = reordered.map((s) => s.id)
    try {
      const res = await fetch('/api/staff/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      })
      if (!res.ok) throw new Error('Failed to reorder')
      const [staffRes] = await Promise.all([
        fetch('/api/staff'),
        fetch(`/api/roster/weeks?weekStart=${weekStart}`)
      ])
      if (staffRes.ok) {
        const staffData: Staff[] = await staffRes.json()
        setAllStaff(staffData)
      }
    } catch (err) {
      console.error('Error reordering staff', err)
      setError('Failed to reorder. Try again.')
    }
  }

  const setEntryFor = (staffId: string, date: string, shiftTemplateId: string | null) => {
    setEntries((prev) => {
      const existing = prev.find((e) => e.staffId === staffId && e.date === date)
      if (existing) {
        if (!shiftTemplateId) {
          // Remove entry if clearing
          return prev.filter((e) => !(e.staffId === staffId && e.date === date))
        }
        return prev.map((e) =>
          e === existing ? { ...e, shiftTemplateId } : e
        )
      }
      if (!shiftTemplateId) return prev
      return [
        ...prev,
        {
          staffId,
          date,
          shiftTemplateId,
          position: null,
          notes: ''
        }
      ]
    })
    // Auto-save roster shortly after any change
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      void handleSave()
    }, 800)
  }

  const handleChangeWeek = (direction: -1 | 1) => {
    setWeekStart((current) => addDays(current, direction * 7))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/roster/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          status: 'draft',
          entries: entries.map((e) => ({
            staffId: e.staffId,
            date: e.date,
            shiftTemplateId: e.shiftTemplateId,
            position: e.position ?? null,
            notes: e.notes ?? ''
          }))
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save roster')
      }
    } catch (err) {
      console.error('Error saving roster', err)
      setError(err instanceof Error ? err.message : 'Failed to save roster')
    } finally {
      setSaving(false)
    }
  }

  const buildRosterText = () => {
    if (displayStaff.length === 0) return 'No staff in this roster.'
    const templateMap = new Map(templates.map((t) => [t.id, t.name]))

    const lines: string[] = []
    lines.push(`Roster for week starting ${weekStart} (through ${weekDates[6]})`)
    lines.push('')
    lines.push('Format: Staff – Mon..Sun (per-day shift name or Off)')
    lines.push('------------------------------------------------------')

    displayStaff.forEach((s) => {
      const dayStrings = weekDates.map((date) => {
        const entry = getEntryFor(s.id, date)
        if (!entry?.shiftTemplateId) return 'Off'
        return templateMap.get(entry.shiftTemplateId) || 'Shift'
      })
      const displayName = s.firstName?.trim() || s.name
      lines.push(`${displayName}: ${dayStrings.join(' | ')}`)
    })

    return lines.join('\n')
  }

  const handleCopyPreviousWeek = async () => {
    const prevWeekStart = addDays(weekStart, -7)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/roster/weeks?weekStart=${prevWeekStart}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to load previous week')
      }
      const data = await res.json()
      const prevEntries: RosterEntry[] = data.entries ?? []
      if (prevEntries.length === 0) {
        alert('Previous week has no shifts to copy.')
        return
      }
      const prevWeekDates = dayLabels.map((_, i) => addDays(prevWeekStart, i))
      const newEntries = prevEntries
        .map((e) => {
          const idx = prevWeekDates.indexOf(e.date)
          if (idx === -1) return null
          return {
            staffId: e.staffId,
            date: weekDates[idx],
            shiftTemplateId: e.shiftTemplateId ?? null,
            position: e.position ?? null,
            notes: e.notes ?? ''
          }
        })
        .filter((e): e is NonNullable<typeof e> => e != null)
      const saveRes = await fetch('/api/roster/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          status: 'draft',
          entries: newEntries
        })
      })
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save roster')
      }
      setEntries(
        newEntries.map((e) => ({
          ...e,
          rosterWeekId: undefined,
          id: undefined
        }))
      )
      alert(`Copied ${newEntries.length} shift(s) from previous week.`)
    } catch (err) {
      console.error('Error copying previous week', err)
      setError(err instanceof Error ? err.message : 'Failed to copy previous week')
    } finally {
      setLoading(false)
    }
  }

  const handleClearWeek = async () => {
    if (entries.length === 0) {
      alert('This week already has no shifts.')
      return
    }
    const confirmed = window.confirm(
      'Clear all shifts for this week? You can\'t undo this.'
    )
    if (!confirmed) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/roster/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          status: 'draft',
          entries: []
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to clear roster')
      }
      setEntries([])
    } catch (err) {
      console.error('Error clearing week', err)
      setError(err instanceof Error ? err.message : 'Failed to clear week')
    } finally {
      setSaving(false)
    }
  }

  const handleEmailShare = async () => {
    if (entries.length === 0) {
      alert('There are no shifts saved for this week yet. Save the roster first, then share.')
      return
    }
    setSharing(true)
    try {
      const recipientsRes = await fetch('/api/email-recipients')
      const list = recipientsRes.ok ? await recipientsRes.json() : []
      const primary = Array.isArray(list) && list.length > 0 ? list[0] : null
      const to = primary?.email as string | undefined
      if (!to) {
        alert('No email recipients configured. Add one in Settings → Email recipients, then try again.')
        return
      }

      const text = buildRosterText()
      const html = `<pre style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; white-space: pre-wrap;">${text.replace(
        /&/g,
        '&amp;'
      )
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>`

      const subject = `Roster – Week of ${weekStart}`

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          html,
          text
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send email')
      }
      alert(`Roster emailed to ${to}.`)
    } catch (err) {
      console.error('Error sending roster email', err)
      alert(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSharing(false)
    }
  }

  const generateRosterImage = async (): Promise<string> => {
    if (!imageRef.current) {
      throw new Error('Nothing to render')
    }
    const canvas = await html2canvas(imageRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false
    })
    return canvas.toDataURL('image/png')
  }

  const handleWhatsAppShare = async () => {
    if (entries.length === 0) {
      alert('There are no shifts saved for this week yet.')
      return
    }
    try {
      setSharing(true)
      const dataUrl = await generateRosterImage()
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'roster.png', { type: 'image/png' })

      // Mobile: use Web Share API to send the image directly to WhatsApp
      if (
        isMobileDevice() &&
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: 'Roster'
        })
        return
      }

      // Desktop: copy PNG to clipboard then open WhatsApp Web
      if (
        navigator.clipboard &&
        'write' in navigator.clipboard &&
        (window as any).ClipboardItem
      ) {
        try {
          const clipboardItem = new (window as any).ClipboardItem({
            'image/png': blob
          })
          await (navigator.clipboard as any).write([clipboardItem])
          window.open('https://web.whatsapp.com/send', '_blank')
          alert('Roster image copied. Paste into WhatsApp Web (Ctrl+V).')
          return
        } catch (clipboardError) {
          console.error('Error copying roster PNG for WhatsApp Web:', clipboardError)
        }
      }

      alert(
        'Your browser cannot share images directly to WhatsApp. Please download or copy the PNG manually.'
      )
    } catch (err) {
      console.error('Error sharing roster image', err)
      alert('Failed to generate roster image')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Roster</h1>
            <p className="text-sm text-gray-600 mt-1">
              Weekly staff roster using existing Staff as source of truth.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/staff')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
            >
              Staff
            </button>
            <button
              onClick={() => router.push('/roster/templates')}
              className="px-4 py-2 bg-sky-600 text-white rounded font-semibold hover:bg-sky-700"
            >
              Shift Presets
            </button>
            <button
              onClick={() => router.push('/shifts')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Shifts
            </button>
          </div>
        </div>

        {/* Week picker and actions */}
        <div className="mb-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleChangeWeek(-1)}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm"
            >
              ← Previous week
            </button>
            <button
              onClick={() => setWeekStart(formatInputDate(getMonday(new Date())))}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm"
            >
              This week
            </button>
            <button
              onClick={() => handleChangeWeek(1)}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm"
            >
              Next week →
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500">Week starting</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className={`px-4 py-2 border-b border-gray-200 flex justify-between items-center ${weekBannerStyle.bg} ${weekBannerStyle.text}`}>
            <span className="text-sm font-semibold">
              Weekly roster ({formatPrettyDate(weekStart)} – {formatPrettyDate(weekDates[6])})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyPreviousWeek}
                disabled={loading || sharing}
                className="px-3 py-1.5 border border-amber-600 text-amber-700 rounded text-xs font-semibold hover:bg-amber-50 disabled:opacity-60"
              >
                Copy previous week
              </button>
              <button
                onClick={handleClearWeek}
                disabled={loading || sharing || entries.length === 0}
                className="px-3 py-1.5 border border-red-600 text-red-700 rounded text-xs font-semibold hover:bg-red-50 disabled:opacity-60"
              >
                Clear week
              </button>
              <button
                onClick={handleWhatsAppShare}
                disabled={sharing}
                className="px-3 py-1.5 border border-green-600 text-green-700 rounded text-xs font-semibold hover:bg-green-50 disabled:opacity-60"
              >
                WhatsApp summary
              </button>
              <button
                onClick={handleEmailShare}
                disabled={sharing}
                className="px-3 py-1.5 border border-indigo-600 text-indigo-700 rounded text-xs font-semibold hover:bg-indigo-50 disabled:opacity-60"
              >
                Email roster
              </button>
              <span className="text-[11px] text-gray-500 min-w-[80px] text-right">
                {saving ? 'Saving…' : 'All changes saved'}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-center text-gray-600 text-sm">Loading roster…</div>
          ) : displayStaff.length === 0 ? (
            <div className="p-6 text-center text-gray-600 text-sm">
              No staff found. Add staff first, then build the roster.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className={weekBannerStyle.bg}>
                  <tr>
                    <th className={`px-4 py-2 text-left text-xs font-medium uppercase tracking-wider ${weekBannerStyle.text}`}>
                      Staff
                    </th>
                    {weekDates.map((date, idx) => (
                      <th
                        key={date}
                        className={`px-2 py-2 text-center text-xs font-medium uppercase tracking-wider ${weekBannerStyle.text}`}
                      >
                        <div>{dayLabels[idx]}</div>
                        <div className="text-[11px] opacity-80">
                          {formatDisplayDate(date)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Running count row: per-day shift totals */}
                  <tr className="bg-gray-50/80 border-b border-gray-200">
                    <td className="px-4 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider align-bottom">
                      Count
                    </td>
                    {weekDates.map((date) => {
                      const counts = countByDayAndShift.get(date)
                      if (!counts) return <td key={date} className="px-1 py-1" />
                      const items: { label: string; count: number; color?: string }[] = []
                      templates.forEach((t) => {
                        const n = counts.get(t.id) ?? 0
                        if (n > 0) items.push({ label: t.name, count: n, color: t.color ?? undefined })
                      })
                      const offCount = counts.get('off') ?? 0
                      if (offCount > 0) items.push({ label: 'Off', count: offCount })
                      return (
                        <td key={date} className="px-1 py-1.5 text-center align-bottom">
                          <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 items-baseline text-[10px] text-gray-600">
                            {items.map(({ label, count, color }) =>
                              color ? (
                                <span
                                  key={label}
                                  className="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-bold text-sm tabular-nums"
                                  style={{ backgroundColor: `${color}30`, color }}
                                >
                                  {count}
                                </span>
                              ) : (
                                <span key={label} className="tabular-nums">
                                  Off: {count}
                                </span>
                              )
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                  {displayStaff.map((s, index) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2 whitespace-nowrap text-xs sm:text-sm">
                        <div className="flex items-center gap-1">
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => handleMoveStaff(index, 'up')}
                              disabled={index === 0}
                              className="p-0.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
                              title="Move up"
                              aria-label="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStaff(index, 'down')}
                              disabled={index === displayStaff.length - 1}
                              className="p-0.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
                              title="Move down"
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                          </div>
                          <div className="font-medium text-gray-900">{s.firstName?.trim() || s.name}</div>
                        </div>
                      </td>
                      {weekDates.map((date) => {
                        const onVacation = isOnVacation(s, date)
                        const entry = getEntryFor(s.id, date)
                        const template = getTemplateForEntry(entry)
                        const bgColor = template?.color || undefined
                        return (
                          <td
                            key={date}
                            className="px-1 py-1 text-center align-middle"
                            style={onVacation ? { backgroundColor: '#f3f4f6' } : bgColor ? { backgroundColor: bgColor } : undefined}
                          >
                            {onVacation ? (
                              <span className="text-xs font-medium text-gray-500">Vacation</span>
                            ) : (
                              <select
                                value={entry?.shiftTemplateId || ''}
                                onChange={(e) =>
                                  setEntryFor(
                                    s.id,
                                    date,
                                    e.target.value === '' ? null : e.target.value
                                  )
                                }
                                className="w-full max-w-[7rem] px-1 py-1 border border-gray-300 rounded text-xs bg-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">Off</option>
                                {templates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Hidden display-only roster view for PNG/WhatsApp (no dropdowns) */}
        <div className="fixed -left-[9999px] -top-[9999px]" aria-hidden="true">
          <div
            ref={imageRef}
            className="inline-block bg-white p-4 rounded shadow text-[11px]"
          >
            <div className="mb-2 font-semibold text-gray-800">
              Roster ({formatPrettyDate(weekStart)} – {formatPrettyDate(weekDates[6])})
            </div>
            <table className="border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border px-2 py-1 text-left">Staff</th>
                  {weekDates.map((date, idx) => (
                    <th key={date} className="border px-2 py-1 text-center">
                      <div className="font-semibold">{dayLabels[idx]}</div>
                      <div className="text-[10px] text-gray-500">
                        {formatDisplayDate(date)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayStaff.map((s) => (
                  <tr key={s.id}>
                    <td className="border px-2 py-1 align-top">
                      <div className="font-medium text-gray-900">{s.firstName?.trim() || s.name}</div>
                    </td>
                    {weekDates.map((date) => {
                      const onVacation = isOnVacation(s, date)
                      const entry = getEntryFor(s.id, date)
                      const tmpl = getTemplateForEntry(entry)
                      const label = onVacation ? 'Vacation' : (tmpl?.name || 'Off')
                      const bg = onVacation ? '#f3f4f6' : (tmpl?.color || '#f9fafb')
                      return (
                        <td
                          key={date}
                          className="border px-2 py-1 text-center align-middle"
                          style={{ backgroundColor: bg }}
                        >
                          {label}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

