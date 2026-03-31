'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizePublicAppUrl } from '@/lib/public-url'
import {
  computeAttendancePunchDayStatuses,
  localCalendarDayKey,
  parseExpectedPunchesPerDay
} from '@/lib/attendance-irregularity'

type PunchDayStatus = 'full' | 'short_ok' | 'irregular'

interface AttendanceLog {
  id: string
  staffId: string | null
  deviceUserId: string
  deviceUserName: string | null
  punchTime: string
  punchType: string
  source: string
  correctedAt?: string | null
  /** full = green, short_ok = blue “Possible missed”, irregular = red */
  punchDayStatus?: PunchDayStatus
  /** Not sent by API; UI derives status from punches + settings. */
  hasIrregularity?: boolean
  staff: { id: string; name: string } | null
}

interface Staff {
  id: string
  name: string
  deviceUserId: string | null
  status?: string
}

/** Staff filter pill: red = any irregular; blue = no irregular but ≥1 possible missed day; green = all full days. */
function staffPillIndicator(
  logsForScope: AttendanceLog[],
  punchDayStatusById: Map<string, PunchDayStatus>
): 'red' | 'blue' | 'green' {
  if (logsForScope.length === 0) return 'green'
  const st = (l: AttendanceLog) => punchDayStatusById.get(l.id) ?? 'irregular'
  if (logsForScope.some((l) => st(l) === 'irregular')) return 'red'
  if (logsForScope.some((l) => st(l) === 'short_ok')) return 'blue'
  return 'green'
}

/** Match API + device-only rows (before staff_id was linked). */
function logBelongsToStaff(log: AttendanceLog, staff: Pick<Staff, 'id' | 'deviceUserId'>): boolean {
  if (log.staffId === staff.id) return true
  const dev = staff.deviceUserId?.trim()
  return Boolean(dev && log.deviceUserId === dev)
}

/** Resolve manual punch staff from typed device user ID, staff id, or exact name match. */
function resolveStaffForManualPunch(input: string, staffWithDevice: Staff[]): Staff | null {
  const t = input.trim()
  if (!t) return null
  const byDevice = staffWithDevice.find((s) => String(s.deviceUserId ?? '').trim() === t)
  if (byDevice) return byDevice
  const byId = staffWithDevice.find((s) => s.id === t)
  if (byId) return byId
  const lower = t.toLowerCase()
  const byName = staffWithDevice.find((s) => s.name.toLowerCase() === lower)
  if (byName) return byName
  return null
}

interface DeviceUser {
  uid: number
  userId: string
  name: string
}

interface DeviceSettings {
  zk_device_ip: string
  zk_device_port: string
  /** Canonical HTTPS base URL for ADMS (no trailing slash). Empty = use current browser origin. */
  public_app_url: string
}

type Tab = 'logs' | 'device'

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function formatDateDisplay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Sum of paired in→out segments (chronological stack; same idea as valid pairing). Unpaired punches add no time. */
function workedMsFromPunchLogs(logs: AttendanceLog[]): number {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime()
  )
  const openInTimes: number[] = []
  let ms = 0
  for (const p of sorted) {
    const ty = String(p.punchType ?? '').toLowerCase().trim()
    const t = new Date(p.punchTime).getTime()
    if (ty === 'in') {
      openInTimes.push(t)
    } else if (ty === 'out') {
      if (openInTimes.length > 0) {
        const tIn = openInTimes.pop()!
        ms += Math.max(0, t - tIn)
      }
    }
  }
  return ms
}

/** For “all staff”: sum each device user’s paired hours, then total. */
function totalWorkedMsAllStaff(logs: AttendanceLog[]): number {
  const byDevice = new Map<string, AttendanceLog[]>()
  for (const l of logs) {
    const id = String(l.deviceUserId ?? '').trim() || 'unknown'
    if (!byDevice.has(id)) byDevice.set(id, [])
    byDevice.get(id)!.push(l)
  }
  let total = 0
  for (const arr of byDevice.values()) {
    total += workedMsFromPunchLogs(arr)
  }
  return total
}

function formatWorkedDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}m`
}

/** Decimal hours to 2 places (common for payroll import). */
function formatDecimalHours(ms: number): string {
  const h = Math.max(0, ms) / 3600000
  return h.toFixed(2)
}

/** For `<input type="datetime-local" />` (local wall time). */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nowDatetimeLocalValue(): string {
  return toDatetimeLocalValue(new Date().toISOString())
}

function parseDatetimeLocalParts(value: string): { date: string; hour: number; minute: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value.trim())
  if (!m) return null
  return { date: m[1], hour: parseInt(m[2], 10), minute: parseInt(m[3], 10) }
}

function buildDatetimeLocal(date: string, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = ((hour % 24) + 24) % 24
  const min = ((minute % 60) + 60) % 60
  return `${date}T${pad(h)}:${pad(min)}`
}

function hour24To12(hour24: number): { h12: number; period: 'AM' | 'PM' } {
  const h = ((hour24 % 24) + 24) % 24
  if (h === 0) return { h12: 12, period: 'AM' }
  if (h < 12) return { h12: h, period: 'AM' }
  if (h === 12) return { h12: 12, period: 'PM' }
  return { h12: h - 12, period: 'PM' }
}

function hour12To24(h12: number, period: 'AM' | 'PM'): number {
  const h = Math.max(1, Math.min(12, Math.floor(h12)))
  if (period === 'AM') return h === 12 ? 0 : h
  return h === 12 ? 12 : h + 12
}

const timeArrowBtn =
  'flex h-7 w-9 shrink-0 items-center justify-center rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 disabled:pointer-events-none'

/** Hour (1–12) or minute (0–59) with arrows + freely typeable digits (not a native number spinbox). */
function TimeSpinInput({
  label,
  value,
  min,
  max,
  pad,
  onChange,
  onIncrement,
  onDecrement,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  pad: boolean
  onChange: (n: number) => void
  onIncrement: () => void
  onDecrement: () => void
  disabled?: boolean
}) {
  const shown = pad ? String(value).padStart(2, '0') : String(value)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(shown)

  useEffect(() => {
    if (!editing) setText(shown)
  }, [shown, editing])

  const commitText = (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (digits === '') return
    const n = parseInt(digits, 10)
    if (Number.isNaN(n)) return
    onChange(Math.min(max, Math.max(min, n)))
  }

  const bump = (fn: () => void) => {
    setEditing(false)
    fn()
  }

  return (
    <div className="flex flex-col items-center gap-0.5" role="group" aria-label={label}>
      <button type="button" className={timeArrowBtn} onClick={() => bump(onIncrement)} disabled={disabled} aria-label={`${label} increase`}>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={editing ? text : shown}
        onFocus={() => {
          setEditing(true)
          setText(shown)
        }}
        onBlur={() => {
          setEditing(false)
          const raw = text.replace(/\D/g, '')
          if (raw === '') {
            setText(shown)
            return
          }
          commitText(raw)
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, '')
          setText(raw)
        }}
        disabled={disabled}
        className="w-12 border border-gray-300 rounded px-1 py-1 text-center font-mono text-lg tabular-nums text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      <button type="button" className={timeArrowBtn} onClick={() => bump(onDecrement)} disabled={disabled} aria-label={`${label} decrease`}>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  )
}

/** Date + 12-hour time with AM/PM, arrows, and typeable fields (no native datetime-local time UI). */
function LocalDateTimePicker({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const fallback = nowDatetimeLocalValue()
  const parsed = parseDatetimeLocalParts(value) ?? parseDatetimeLocalParts(fallback) ?? {
    date: fallback.slice(0, 10),
    hour: 12,
    minute: 0,
  }
  const { date, hour: hour24, minute } = parsed
  const { h12, period } = hour24To12(hour24)

  const apply = (next: Partial<{ date: string; hour: number; minute: number }>) => {
    onChange(buildDatetimeLocal(next.date ?? date, next.hour ?? hour24, next.minute ?? minute))
  }

  return (
    <div className="space-y-2">
      <input
        id={`${idPrefix}-date`}
        type="date"
        value={date}
        onChange={(e) => apply({ date: e.target.value })}
        disabled={disabled}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1 sm:gap-3">
        <TimeSpinInput
          label="Hour"
          value={h12}
          min={1}
          max={12}
          pad={false}
          disabled={disabled}
          onChange={(n) => apply({ hour: hour12To24(n, period) })}
          onIncrement={() => apply({ hour: hour24 + 1 })}
          onDecrement={() => apply({ hour: hour24 - 1 })}
        />
        <span className="self-center text-2xl font-light text-gray-400 select-none" aria-hidden>
          :
        </span>
        <TimeSpinInput
          label="Minute"
          value={minute}
          min={0}
          max={59}
          pad={true}
          disabled={disabled}
          onChange={(n) => apply({ minute: n })}
          onIncrement={() => apply({ minute: minute + 1 })}
          onDecrement={() => apply({ minute: minute - 1 })}
        />
        <label className="sr-only" htmlFor={`${idPrefix}-ampm`}>
          AM or PM
        </label>
        <select
          id={`${idPrefix}-ampm`}
          value={period}
          onChange={(e) => apply({ hour: hour12To24(h12, e.target.value as 'AM' | 'PM') })}
          disabled={disabled}
          className="self-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  )
}

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState<Tab>('logs')

  // --- Logs tab state ---
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'custom' | 'sinceLastReport'>('week')
  /** Inclusive start when a pay period report was saved & emailed (day after that period’s end). */
  const [payPeriodCutoff, setPayPeriodCutoff] = useState<string | null>(null)
  const [customStart, setCustomStart] = useState(formatDate(new Date()))
  const [customEnd, setCustomEnd] = useState(formatDate(new Date()))
  const [staffFilter, setStaffFilter] = useState<string>('')
  /** Narrows the staff list below (name substring, case-insensitive). */
  const [staffSearch, setStaffSearch] = useState('')
  const [expectedPunchesPerDay, setExpectedPunchesPerDay] = useState(4)

  const [editingLog, setEditingLog] = useState<AttendanceLog | null>(null)
  const [editPunchLocal, setEditPunchLocal] = useState('')
  const [editPunchType, setEditPunchType] = useState<'in' | 'out'>('in')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [showAddPunch, setShowAddPunch] = useState(false)
  const [addStaffInput, setAddStaffInput] = useState('')
  const [addPunchLocal, setAddPunchLocal] = useState('')
  const [addPunchType, setAddPunchType] = useState<'in' | 'out'>('in')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // --- Current period pay day ---
  const [currentPeriodPayDay, setCurrentPeriodPayDay] = useState<{ date: string; notes: string | null } | null>(null)

  // --- Device tab state ---
  const [deviceUsers, setDeviceUsers] = useState<DeviceUser[]>([])
  const [deviceLoading, setDeviceLoading] = useState(false)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [mappings, setMappings] = useState<Record<string, string>>({}) // deviceUserId → staffId
  const [mappingSaving, setMappingSaving] = useState(false)
  const [pushingStaff, setPushingStaff] = useState(false)
  const [deviceActionResult, setDeviceActionResult] = useState<string | null>(null)
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>({
    zk_device_ip: '',
    zk_device_port: '4370',
    public_app_url: ''
  })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const { startDate, endDate } = useMemo(() => {
    const now = new Date()
    const todayStr = formatDate(now)
    if (dateRange === 'sinceLastReport' && payPeriodCutoff) {
      return { startDate: payPeriodCutoff, endDate: todayStr }
    }
    if (dateRange === 'sinceLastReport' && !payPeriodCutoff) {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      return { startDate: formatDate(start), endDate: todayStr }
    }
    if (dateRange === 'week') {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      return { startDate: formatDate(start), endDate: todayStr }
    }
    if (dateRange === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { startDate: formatDate(start), endDate: formatDate(end) }
    }
    return { startDate: customStart, endDate: customEnd }
  }, [dateRange, payPeriodCutoff, customStart, customEnd])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      const [logsRes, settingsRes] = await Promise.all([
        fetch(`/api/attendance/logs?${params}`, { cache: 'no-store' }),
        fetch('/api/attendance/settings', { cache: 'no-store' })
      ])
      if (!logsRes.ok) throw new Error('Failed to load logs')
      const data: AttendanceLog[] = await logsRes.json()
      setLogs(data)
      if (settingsRes.ok) {
        const s = (await settingsRes.json()) as { expectedPunchesPerDay?: number }
        if (typeof s.expectedPunchesPerDay === 'number') {
          setExpectedPunchesPerDay(parseExpectedPunchesPerDay(String(s.expectedPunchesPerDay)))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const res = await fetch('/api/staff')
        if (res.ok) {
          const data: Staff[] = await res.json()
          setAllStaff(data)
        }
      } catch {}
    }
    void loadStaff()
  }, [])

  useEffect(() => {
    const loadCurrentPeriodPayDay = async () => {
      try {
        const res = await fetch('/api/pay-days?period=current')
        if (res.ok) {
          const data = await res.json()
          setCurrentPeriodPayDay(data?.date ? { date: data.date, notes: data.notes ?? null } : null)
        } else {
          setCurrentPeriodPayDay(null)
        }
      } catch {
        setCurrentPeriodPayDay(null)
      }
    }
    void loadCurrentPeriodPayDay()
  }, [])

  /** Default log range: from day after last pay period that was saved & emailed, through today. */
  useEffect(() => {
    const loadCutoff = async () => {
      try {
        const res = await fetch('/api/attendance/pay-period/last-sent-cutoff')
        if (!res.ok) return
        const data = (await res.json()) as { cutoffDate?: string | null }
        const c = data.cutoffDate ?? null
        setPayPeriodCutoff(c)
      } catch {
        // ignore
      }
    }
    void loadCutoff()
  }, [])

  const staffWithDevice = useMemo(() => allStaff.filter((s) => s.deviceUserId), [allStaff])

  /** Active staff with device mapping — used for quick-filter tabs. */
  const activeStaffWithDevice = useMemo(
    () => allStaff.filter((s) => s.deviceUserId && s.status !== 'inactive'),
    [allStaff]
  )

  const displayedLogs = useMemo(() => {
    if (!staffFilter) return logs
    const s = staffWithDevice.find((x) => x.id === staffFilter)
    if (!s) return []
    return logs.filter((log) => logBelongsToStaff(log, s))
  }, [logs, staffFilter, staffWithDevice])

  const staffListFiltered = useMemo(() => {
    const q = staffSearch.trim().toLowerCase()
    if (!q) return activeStaffWithDevice
    return activeStaffWithDevice.filter((s) => s.name.toLowerCase().includes(q))
  }, [activeStaffWithDevice, staffSearch])

  /** Same “day” as the Date column: local calendar date; matches expected punches setting. */
  const punchDayStatusById = useMemo(() => {
    const punches = logs.map((l) => ({
      id: l.id,
      staffId: l.staffId,
      deviceUserId: l.deviceUserId,
      punchTime: new Date(l.punchTime),
      punchType: l.punchType
    }))
    return computeAttendancePunchDayStatuses(punches, expectedPunchesPerDay, localCalendarDayKey)
  }, [logs, expectedPunchesPerDay])

  const allTabPill = useMemo(() => staffPillIndicator(logs, punchDayStatusById), [logs, punchDayStatusById])
  const staffTabPill = useMemo(() => {
    const m = new Map<string, 'red' | 'blue' | 'green'>()
    for (const s of activeStaffWithDevice) {
      const theirs = logs.filter((log) => logBelongsToStaff(log, s))
      m.set(s.id, staffPillIndicator(theirs, punchDayStatusById))
    }
    return m
  }, [logs, activeStaffWithDevice, punchDayStatusById])

  // Load device settings from DB on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings?keys=zk_device_ip,zk_device_port,public_app_url')
        if (res.ok) {
          const data = await res.json()
          setDeviceSettings({
            zk_device_ip: data.zk_device_ip || '',
            zk_device_port: data.zk_device_port || '4370',
            public_app_url: data.public_app_url ? normalizePublicAppUrl(data.public_app_url) : ''
          })
        }
      } catch {}
    }
    void loadSettings()
  }, [])

  const handleSaveDeviceSettings = async () => {
    setSettingsSaving(true)
    setSettingsSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: deviceSettings })
      })
      if (res.ok) setSettingsSaved(true)
    } catch {}
    finally { setSettingsSaving(false) }
  }

  const openEditLog = (log: AttendanceLog) => {
    setShowAddPunch(false)
    setEditingLog(log)
    setEditPunchLocal(toDatetimeLocalValue(log.punchTime))
    setEditPunchType(log.punchType === 'out' ? 'out' : 'in')
    setEditError(null)
  }

  const closeEditLog = () => {
    setEditingLog(null)
    setEditError(null)
  }

  const openAddPunch = () => {
    setEditingLog(null)
    setAddError(null)
    const fromFilter = staffWithDevice.find((s) => s.id === staffFilter)
    const fallback = staffWithDevice[0]
    setAddStaffInput(
      fromFilter?.deviceUserId?.trim() ?? fallback?.deviceUserId?.trim() ?? ''
    )
    setAddPunchLocal(nowDatetimeLocalValue())
    setAddPunchType('in')
    setShowAddPunch(true)
  }

  const closeAddPunch = () => {
    if (addSaving) return
    setShowAddPunch(false)
    setAddError(null)
  }

  const handleSaveAddPunch = async () => {
    const staff = resolveStaffForManualPunch(addStaffInput, staffWithDevice)
    if (!staff) {
      setAddError(
        'Enter the device user ID (number from the ZKTeco device), or pick a staff name from the suggestions.'
      )
      return
    }
    setAddSaving(true)
    setAddError(null)
    try {
      const punchTime = new Date(addPunchLocal)
      if (isNaN(punchTime.getTime())) {
        setAddError('Invalid date and time')
        return
      }
      const res = await fetch('/api/attendance/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: staff.id,
          punchTime: punchTime.toISOString(),
          punchType: addPunchType
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save')
      closeAddPunch()
      await fetchLogs()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setAddSaving(false)
    }
  }

  const handleSaveEditLog = async () => {
    if (!editingLog) return
    setEditSaving(true)
    setEditError(null)
    try {
      const punchTime = new Date(editPunchLocal)
      if (isNaN(punchTime.getTime())) {
        setEditError('Invalid date and time')
        return
      }
      const res = await fetch(`/api/attendance/logs/${editingLog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          punchTime: punchTime.toISOString(),
          punchType: editPunchType
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save')
      closeEditLog()
      await fetchLogs()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteEditLog = async () => {
    if (!editingLog) return
    if (!window.confirm('Delete this punch permanently? Use only for duplicate or mistaken entries.')) return
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/attendance/logs/${editingLog.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to delete')
      closeEditLog()
      await fetchLogs()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setEditSaving(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/attendance/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(Boolean)
        throw new Error(parts.length ? parts.join('\n\n') : 'Sync failed')
      }
      await fetchLogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleImportDeviceUsers = async () => {
    setDeviceLoading(true)
    setDeviceError(null)
    setDeviceActionResult(null)
    try {
      const res = await fetch('/api/attendance/sync', { method: 'POST' })
      if (!res.ok) {
        // If sync fails, the device endpoint isn't reachable — show helpful message
        setDeviceError('Cannot reach device. Run the app locally on the same network as the device, or use the Windows Agent.')
        return
      }
      // Pull device users via a temporary approach — call sync which returns user info
      // For now, show a message that this requires local access
      setDeviceActionResult('Device users can be imported via the Windows Agent dashboard at localhost:3001 → Push Staff to Device.')
    } catch (err) {
      setDeviceError('Device not reachable from this browser. Use the local Windows Agent.')
    } finally {
      setDeviceLoading(false)
    }
  }

  const handleSaveMappings = async () => {
    const pairs = Object.entries(mappings).filter(([, staffId]) => staffId)
    if (pairs.length === 0) return
    setMappingSaving(true)
    try {
      const res = await fetch('/api/attendance/device/map-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: pairs.map(([deviceUserId, staffId]) => ({ deviceUserId, staffId })) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setDeviceActionResult(`Saved ${data.updated} mapping${data.updated === 1 ? '' : 's'} successfully.`)
      // Refresh staff list
      const staffRes = await fetch('/api/staff')
      if (staffRes.ok) setAllStaff(await staffRes.json())
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'Failed to save mappings')
    } finally {
      setMappingSaving(false)
    }
  }

  const irregularityCount = useMemo(
    () => logs.filter((l) => (punchDayStatusById.get(l.id) ?? 'irregular') === 'irregular').length,
    [logs, punchDayStatusById]
  )

  const hoursInRangeSummary = useMemo(() => {
    const title =
      'Sum of in→out durations from paired punches in this view (chronological order). Unpaired ins/outs add no time. Decimal hours use two places (payroll-style).'
    if (loading) {
      return { displayHm: '—' as const, displayDecimal: '—' as const, caption: 'Hours in range', title }
    }
    if (displayedLogs.length === 0) {
      return {
        displayHm: formatWorkedDuration(0),
        displayDecimal: formatDecimalHours(0),
        caption: staffFilter
          ? `Hours — ${staffWithDevice.find((x) => x.id === staffFilter)?.name ?? 'staff'}`
          : 'Total hours — all staff',
        title,
      }
    }
    const ms = staffFilter ? workedMsFromPunchLogs(displayedLogs) : totalWorkedMsAllStaff(displayedLogs)
    const name = staffWithDevice.find((x) => x.id === staffFilter)?.name
    return {
      displayHm: formatWorkedDuration(ms),
      displayDecimal: formatDecimalHours(ms),
      caption: staffFilter ? `Hours — ${name ?? 'staff'}` : 'Total hours — all staff',
      title,
    }
  }, [displayedLogs, staffFilter, staffWithDevice, loading])

  /** URL shown for ZKTeco ADMS — saved canonical URL, else current browser origin. */
  const admsBaseUrl = useMemo(() => {
    const saved = deviceSettings.public_app_url?.trim()
    if (saved) return normalizePublicAppUrl(saved)
    if (typeof window !== 'undefined') return window.location.origin
    return 'https://your-app.vercel.app'
  }, [deviceSettings.public_app_url])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
            <p className="text-sm text-gray-600 mt-1">
              ZKTeco device integration — logs, staff sync, and device setup.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {currentPeriodPayDay && (
              <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                <span className="text-amber-800 font-medium">Pay day this period:</span>{' '}
                <span className="text-amber-900">{formatDateDisplay(currentPeriodPayDay.date + 'T12:00:00')}</span>
              </div>
            )}
            <Link
              href="/attendance/settings"
              className="px-4 py-2 border border-gray-300 bg-white text-gray-800 rounded font-semibold hover:bg-gray-50 inline-block text-sm"
            >
              Settings
            </Link>
            <a
              href="/attendance/pay-period"
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 inline-block"
            >
              Pay Period Report
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {(['logs', 'device'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab === 'logs' ? 'Attendance Logs' : 'Device Management'}
            </button>
          ))}
        </div>

        {/* ── LOGS TAB ── */}
        {activeTab === 'logs' && (
          <>
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-4">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {syncing ? 'Syncing…' : 'Sync from device'}
              </button>
              <button
                type="button"
                onClick={openAddPunch}
                disabled={staffWithDevice.length === 0}
                title={
                  staffWithDevice.length === 0
                    ? 'Map staff to device users on the Device Management tab first'
                    : 'Record a missed clock-in or clock-out'
                }
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add punch
              </button>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Range:</span>
                <select
                  value={dateRange}
                  onChange={(e) =>
                    setDateRange(e.target.value as 'week' | 'month' | 'custom' | 'sinceLastReport')
                  }
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {payPeriodCutoff && (
                    <option value="sinceLastReport">Since last pay report (emailed)</option>
                  )}
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {dateRange === 'sinceLastReport' && payPeriodCutoff && (
                <span className="text-xs text-gray-500 max-w-md">
                  Showing {payPeriodCutoff} through today — based on the latest pay period report that was saved and emailed.
                </span>
              )}

              {dateRange === 'custom' && (
                <div className="flex items-center gap-2">
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
                  <span className="text-gray-500">to</span>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
              )}

              {irregularityCount > 0 && (
                <div className="ml-auto px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm font-medium">
                  {irregularityCount} irregularit{irregularityCount === 1 ? 'y' : 'ies'} need attention
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 mb-2">
              Expected punches per day (see{' '}
              <Link href="/attendance/settings" className="font-medium text-blue-600 hover:text-blue-800">
                Attendance settings
              </Link>
              ) drives &quot;full day&quot; vs &quot;Possible missed&quot;.
            </p>
            <p className="text-xs text-gray-600 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span
                className="inline-flex cursor-help items-center gap-1.5"
                title="Punch count matches expected punches per day (Attendance settings) and in/out pairing is valid."
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-emerald-600" aria-hidden />
                Full day
              </span>
              <span
                className="inline-flex cursor-help items-center gap-1.5"
                title="Two punches with a valid in/out pair (fewer than expected daily total). Blue means possible missed punches in range, not necessarily an error."
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-sky-600" aria-hidden />
                Possible missed
              </span>
              <span
                className="inline-flex cursor-help items-center gap-1.5"
                title="Bad in/out sequence or punch count doesn’t match rules for that day."
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-red-500" aria-hidden />
                Irregular
              </span>
            </p>

            {/* Main (~80%) + staff rail (~20%) on lg; stacked on small (staff above table via flex-col-reverse). */}
            <div className="mb-4 flex flex-col-reverse gap-4 lg:flex-row lg:items-start lg:gap-4">
              <div className="min-w-0 flex-1 space-y-4 lg:flex-[4]">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 whitespace-pre-line">{error}</div>
                )}

                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr className="border-b border-gray-200 bg-slate-50">
                      <td colSpan={6} className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                        {hoursInRangeSummary.caption}
                      </td>
                      <td className="px-3 py-2 text-right align-bottom">
                        <span
                          className="inline-block rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-right shadow-sm"
                          title={hoursInRangeSummary.title}
                        >
                          <span className="block text-sm font-semibold tabular-nums text-gray-900">
                            {hoursInRangeSummary.displayHm}
                          </span>
                          <span className="mt-0.5 block text-xs font-medium tabular-nums text-gray-600">
                            {hoursInRangeSummary.displayDecimal === '—' ? '—' : `${hoursInRangeSummary.displayDecimal} hr`}
                          </span>
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700 w-12" title="Green full day / blue possible missed / red irregular">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Time</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Type</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Staff</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Source</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-700 w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Loading…</td></tr>
                    ) : displayedLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                          {staffFilter
                            ? 'No attendance logs for this staff in this date range.'
                            : 'No attendance logs in this range. Sync from the device, or use Add punch for a missed clock-in/out.'}
                        </td>
                      </tr>
                    ) : (
                      displayedLogs.map((log) => {
                        const st = punchDayStatusById.get(log.id) ?? 'irregular'
                        const rowBg =
                          st === 'irregular'
                            ? 'bg-red-50/50'
                            : st === 'short_ok'
                              ? 'bg-sky-50/50'
                              : 'bg-emerald-50/35'
                        return (
                        <tr key={log.id} className={`border-t border-gray-100 hover:bg-gray-50 ${rowBg}`}>
                          <td className="px-3 py-2">
                            {st === 'irregular' ? (
                              <span
                                className="inline-block w-4 h-4 bg-red-500 rounded-sm shrink-0"
                                title="Irregular: bad in/out sequence or punch count doesn’t match rules"
                              />
                            ) : st === 'short_ok' ? (
                              <span
                                className="inline-block w-4 h-4 bg-sky-600 rounded-sm shrink-0"
                                title="Possible missed: two punches with a valid in/out pair (fewer than expected daily total)"
                              />
                            ) : (
                              <span
                                className="inline-block w-4 h-4 bg-emerald-600 rounded-sm shrink-0"
                                title="Full day: punch count matches expected and in/out pairing is valid"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {formatDateDisplay(log.punchTime)}
                            {log.correctedAt && (
                              <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-800" title={`Adjusted in app at ${new Date(log.correctedAt).toLocaleString()}`}>
                                Corrected
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium">{formatTime(log.punchTime)}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${log.punchType === 'in' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                              {log.punchType === 'in' ? 'In' : 'Out'}
                            </span>
                          </td>
                          <td className="px-3 py-2">{log.staff?.name ?? log.deviceUserName ?? `Device ${log.deviceUserId}`}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{log.source}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => openEditLog(log)}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      )})
                    )}
                  </tbody>
                </table>
              </div>
            </div>
              </div>

              <aside
                className="w-full shrink-0 lg:flex-[1] lg:min-w-[16rem] lg:max-w-sm lg:sticky lg:top-4 lg:self-start"
                aria-label="Filter logs by staff"
              >
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Staff
                  </div>
                  {activeStaffWithDevice.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      Map active staff to device users on Device Management to enable quick filters.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setStaffFilter('')
                            setStaffSearch('')
                          }}
                          title={
                            allTabPill === 'red'
                              ? 'At least one irregular (red) row in this range'
                              : allTabPill === 'blue'
                                ? 'No irregular rows; at least one possible missed day (blue)'
                                : 'All rows are full days (green) in this range'
                          }
                          className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                            staffFilter === ''
                              ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-sm'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          All
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-[2px] shrink-0 ${
                              allTabPill === 'red' ? 'bg-red-500' : allTabPill === 'blue' ? 'bg-sky-500' : 'bg-emerald-500'
                            }`}
                            aria-hidden
                          />
                        </button>
                        <label className="sr-only" htmlFor="staff-search">
                          Search staff by name
                        </label>
                        <input
                          id="staff-search"
                          type="search"
                          value={staffSearch}
                          onChange={(e) => setStaffSearch(e.target.value)}
                          placeholder="Search staff by name…"
                          autoComplete="off"
                          className="min-w-0 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      {staffFilter && (
                        <p className="mt-2 text-xs text-gray-600">
                          Showing logs for{' '}
                          <span className="font-semibold text-gray-900">
                            {staffWithDevice.find((x) => x.id === staffFilter)?.name ?? 'Staff'}
                          </span>
                          .{' '}
                          <button
                            type="button"
                            onClick={() => setStaffFilter('')}
                            className="font-medium text-blue-600 hover:text-blue-800"
                          >
                            Show all
                          </button>
                        </p>
                      )}
                      <div
                        className="mt-2 h-72 overflow-y-scroll rounded-lg border border-gray-200 bg-gray-50/80 scrollbar-staff-panel"
                        role="listbox"
                        aria-label="Filter by staff member"
                      >
                        {staffListFiltered.length === 0 ? (
                          <p className="px-3 py-4 text-center text-sm text-gray-500">No staff match your search.</p>
                        ) : (
                          staffListFiltered.map((s) => {
                            const pill = staffTabPill.get(s.id) ?? 'green'
                            const selected = staffFilter === s.id
                            const statusHint =
                              pill === 'red'
                                ? 'Has irregular (red) rows — review'
                                : pill === 'blue'
                                  ? 'Possible missed (blue) and/or full days — may be missing punches'
                                  : 'All full days (green) in this range'
                            return (
                              <button
                                key={s.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => setStaffFilter(s.id)}
                                title={`${s.name} — ${statusHint}`}
                                className={`flex w-full items-center justify-between gap-2 border-b border-gray-100 px-2 py-2 text-left text-sm last:border-b-0 hover:bg-white ${
                                  selected ? 'bg-blue-50 font-medium text-blue-900' : 'text-gray-900'
                                }`}
                              >
                                <span className="min-w-0 break-words">{s.name}</span>
                                <span
                                  className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${
                                    pill === 'red' ? 'bg-red-500' : pill === 'blue' ? 'bg-sky-500' : 'bg-emerald-500'
                                  }`}
                                  aria-hidden
                                />
                              </button>
                            )
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>
              </aside>
            </div>

            {showAddPunch && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-punch-title"
                onClick={(e) => e.target === e.currentTarget && !addSaving && closeAddPunch()}
              >
                <div className="bg-white rounded-lg border border-gray-200 shadow-xl max-w-md w-full p-5">
                  <h2 id="add-punch-title" className="text-lg font-semibold text-gray-900 mb-1">Add punch</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Record a clock-in or clock-out someone forgot. It appears like other logs with source &quot;manual&quot;.
                  </p>
                  {addError && (
                    <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-line">{addError}</div>
                  )}
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="add-punch-staff">
                        Staff
                      </label>
                      <input
                        id="add-punch-staff"
                        type="text"
                        list="add-punch-staff-datalist"
                        value={addStaffInput}
                        onChange={(e) => setAddStaffInput(e.target.value)}
                        placeholder="Device user ID (e.g. 12)"
                        autoComplete="off"
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                      <datalist id="add-punch-staff-datalist">
                        {staffWithDevice.map((s) => (
                          <option key={s.id} value={String(s.deviceUserId ?? '')}>
                            {s.name}
                          </option>
                        ))}
                      </datalist>
                      <p className="mt-1 text-xs text-gray-500">
                        Type the device user number, or start typing a name to pick from the list.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="add-punch-date">
                        Date and time
                      </label>
                      <LocalDateTimePicker
                        idPrefix="add-punch"
                        value={addPunchLocal}
                        onChange={setAddPunchLocal}
                        disabled={addSaving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <select
                        value={addPunchType}
                        onChange={(e) => setAddPunchType(e.target.value as 'in' | 'out')}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      >
                        <option value="in">In</option>
                        <option value="out">Out</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeAddPunch}
                      disabled={addSaving}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAddPunch}
                      disabled={addSaving}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {addSaving ? 'Saving…' : 'Add punch'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {editingLog && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-punch-title"
                onClick={(e) => e.target === e.currentTarget && !editSaving && closeEditLog()}
              >
                <div className="bg-white rounded-lg border border-gray-200 shadow-xl max-w-md w-full p-5">
                  <h2 id="edit-punch-title" className="text-lg font-semibold text-gray-900 mb-1">Correct punch</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    {editingLog.staff?.name ?? editingLog.deviceUserName ?? `Device ${editingLog.deviceUserId}`}
                  </p>
                  {editError && (
                    <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{editError}</div>
                  )}
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="edit-punch-date">
                        Date and time
                      </label>
                      <LocalDateTimePicker
                        idPrefix="edit-punch"
                        value={editPunchLocal}
                        onChange={setEditPunchLocal}
                        disabled={editSaving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <select
                        value={editPunchType}
                        onChange={(e) => setEditPunchType(e.target.value as 'in' | 'out')}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      >
                        <option value="in">In</option>
                        <option value="out">Out</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteEditLog}
                      disabled={editSaving}
                      className="px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
                    >
                      Delete punch
                    </button>
                    <div className="flex gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={closeEditLog}
                        disabled={editSaving}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEditLog}
                        disabled={editSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                      >
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── DEVICE MANAGEMENT TAB ── */}
        {activeTab === 'device' && (
          <div className="space-y-6">

            {/* Device Settings */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Device Settings</h2>
              <p className="text-sm text-gray-600 mb-4">
                Saved to the database — no env vars or redeployment required.
                <span className="ml-1 inline-block px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded font-medium">
                  Direct sync only works on the same local network as the device
                </span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Device IP Address</label>
                  <input
                    type="text"
                    placeholder="e.g. 192.168.1.100"
                    value={deviceSettings.zk_device_ip}
                    onChange={(e) => setDeviceSettings((s) => ({ ...s, zk_device_ip: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Device Port</label>
                  <input
                    type="number"
                    placeholder="4370"
                    value={deviceSettings.zk_device_port}
                    onChange={(e) => setDeviceSettings((s) => ({ ...s, zk_device_port: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Public app URL <span className="text-gray-400 font-normal">(for ADMS on the device)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://your-project.vercel.app"
                  value={deviceSettings.public_app_url}
                  onChange={(e) => setDeviceSettings((s) => ({ ...s, public_app_url: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Set this to your production hostname after renaming the Vercel project (no hyphens if the keypad cannot type them). Leave blank to use whatever URL you opened in the browser.
                </p>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSaveDeviceSettings}
                  disabled={settingsSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {settingsSaving ? 'Saving…' : 'Save Settings'}
                </button>
                {settingsSaved && (
                  <span className="text-sm text-green-700 font-medium">Saved successfully.</span>
                )}
              </div>
              {deviceSettings.zk_device_ip && (
                <p className="mt-3 text-xs text-gray-500">
                  Current: <span className="font-mono font-medium text-gray-700">{deviceSettings.zk_device_ip}:{deviceSettings.zk_device_port || 4370}</span>
                  {' '} — Use &ldquo;Sync from device&rdquo; on the Logs tab when on the same network, or configure the Windows Agent for automatic cloud sync.
                </p>
              )}
            </div>

            {/* ADMS Setup */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">ADMS Setup (Real-time Push)</h2>
              <p className="text-sm text-gray-600 mb-4">
                ZKTeco devices use the standard <strong>iClock</strong> paths (<code className="bg-gray-100 px-1 rounded text-xs">/iclock/…</code>), not only <code className="bg-gray-100 px-1 rounded text-xs">/api/…</code>.
                Go to <strong>COMM → Cloud Server Setting</strong> on the F22 and enter:
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-sm space-y-2">
                <div className="flex gap-4 flex-wrap"><span className="text-gray-500 w-40 shrink-0">Server Address</span><span className="font-semibold text-gray-900 break-all">{admsBaseUrl.replace('https://', '').replace('http://', '')}</span></div>
                <div className="flex gap-4"><span className="text-gray-500 w-40">Server Port</span><span className="font-semibold text-gray-900">443</span></div>
                <div className="flex gap-4"><span className="text-gray-500 w-40">HTTPS</span><span className="font-semibold text-gray-900">ON</span></div>
                <div className="flex gap-4"><span className="text-gray-500 w-40">Enable Domain Name</span><span className="font-semibold text-gray-900">ON</span></div>
                <div className="border-t border-gray-200 pt-2 mt-1">
                  <div className="text-xs font-semibold text-gray-700 mb-1">Push URL (punches) — prefer this</div>
                  <div className="font-semibold text-blue-700 break-all">{admsBaseUrl}/iclock/cdata</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-1">Poll URL (heartbeat / commands)</div>
                  <div className="text-blue-800 break-all">{admsBaseUrl}/iclock/getrequest</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Legacy (still works)</div>
                  <div className="text-gray-600 break-all">{admsBaseUrl}/api/attendance/adms</div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                If your device has a single &ldquo;API Endpoint&rdquo; field, set the <strong>Push URL</strong> line. Punches should appear in Attendance Logs within seconds after the device uploads.
              </p>
              <p className="text-xs text-gray-600 mt-2">
                <strong>Test:</strong> Open{' '}
                <a className="text-blue-600 underline break-all" href={`${admsBaseUrl}/iclock/getrequest?SN=test`} target="_blank" rel="noreferrer">
                  {admsBaseUrl}/iclock/getrequest?SN=test
                </a>
                {' '}in a browser — you should see <code className="bg-gray-100 px-1 rounded">OK</code>. In Vercel → Logs you should see{' '}
                <code className="bg-gray-100 px-1 rounded">[ADMS] edge GET /iclock/getrequest</code> (or similar). If there are <strong>no</strong> lines containing{' '}
                <code className="bg-gray-100 px-1 rounded">[ADMS]</code>, the device is not reaching this deployment — fix Push URL, HTTPS, and DNS on the device.
              </p>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                <strong>Hostname:</strong> If the keypad cannot type hyphens, set <strong>Public app URL</strong> above to your renamed Vercel host and save.
              </p>
            </div>

            {/* Windows Agent */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Windows Agent</h2>
              <p className="text-sm text-gray-600 mb-4">
                Install the local agent on an always-on PC at the station. It automatically pushes new staff to the device
                and syncs attendance logs as a backup. Runs silently in the system tray.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-blue-800 mb-1">Auto Staff Sync</div>
                  <div className="text-blue-700">Every 5 min — pushes new staff to device automatically</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-green-800 mb-1">Attendance Backup</div>
                  <div className="text-green-700">Every 15 min — backup sync in case ADMS fails</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-purple-800 mb-1">Local Dashboard</div>
                  <div className="text-purple-700">Status & controls at localhost:3001</div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>To build the installer:</strong> Run <code className="bg-amber-100 px-1 rounded">cd agent &amp;&amp; npm install &amp;&amp; npm run build</code> — produces a <code>.exe</code> installer in <code>agent/dist/</code>.
              </div>
            </div>

            {/* Staff Device Mapping */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Staff ↔ Device Mapping</h2>
              <p className="text-sm text-gray-600 mb-4">
                Each staff member needs a Device User ID to link their punch records to their profile.
                Set this on each staff member&apos;s edit page, or use the Windows Agent dashboard to import from the device.
              </p>

              {deviceError && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{deviceError}</div>
              )}
              {deviceActionResult && (
                <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{deviceActionResult}</div>
              )}

              <table className="w-full text-sm mb-4">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Staff Member</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Device User ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allStaff.filter(s => s).map((s) => (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{s.name}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono">{s.deviceUserId || '—'}</td>
                      <td className="px-3 py-2">
                        {s.deviceUserId ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Mapped</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Not mapped</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex gap-3 flex-wrap">
                <a
                  href="/staff"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700"
                >
                  Edit Staff Profiles
                </a>
                <button
                  onClick={handleImportDeviceUsers}
                  disabled={deviceLoading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {deviceLoading ? 'Checking…' : 'Import from Device (LAN only)'}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
