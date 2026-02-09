'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Staff {
  id: string
  name: string
  status: string
  role: string
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

const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function RosterPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<Staff[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [weekStart, setWeekStart] = useState<string>(() =>
    formatInputDate(getMonday(new Date()))
  )
  const [entries, setEntries] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekDates = useMemo(
    () => dayLabels.map((_, idx) => addDays(weekStart, idx)),
    [weekStart]
  )

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
          setStaff(staffData.filter((s) => s.status === 'active'))
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
      alert('Roster saved.')
    } catch (err) {
      console.error('Error saving roster', err)
      setError(err instanceof Error ? err.message : 'Failed to save roster')
    } finally {
      setSaving(false)
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
          <div className="px-4 py-2 border-b border-gray-200 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-700">
              Weekly roster ({weekStart} – {weekDates[6]})
            </span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save roster'}
            </button>
          </div>

          {loading ? (
            <div className="p-6 text-center text-gray-600 text-sm">Loading roster…</div>
          ) : staff.length === 0 ? (
            <div className="p-6 text-center text-gray-600 text-sm">
              No staff found. Add staff first, then build the roster.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Staff
                    </th>
                    {weekDates.map((date, idx) => (
                      <th
                        key={date}
                        className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        <div>{dayLabels[idx]}</div>
                        <div className="text-[11px] text-gray-400">{date}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {staff.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap text-xs sm:text-sm">
                        <div className="font-medium text-gray-900">{s.name}</div>
                        <div className="text-[11px] text-gray-500">{s.role}</div>
                      </td>
                      {weekDates.map((date) => {
                        const entry = getEntryFor(s.id, date)
                        return (
                          <td key={date} className="px-1 py-1 text-center align-middle">
                            <select
                              value={entry?.shiftTemplateId || ''}
                              onChange={(e) =>
                                setEntryFor(
                                  s.id,
                                  date,
                                  e.target.value === '' ? null : e.target.value
                                )
                              }
                              className="w-full max-w-[7rem] px-1 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">Off</option>
                              {templates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
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
      </div>
    </div>
  )
}

