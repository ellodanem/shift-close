'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/app/components/AuthContext'
import { normalizePublicAppUrl } from '@/lib/public-url'
import { canViewArchivedAttendanceLogs } from '@/lib/roles'
import {
  computeAttendancePunchDayStatuses,
  localCalendarDayKey,
  parseExpectedPunchesPerDay
} from '@/lib/attendance-irregularity'
import { deviceUserIdsMatch } from '@/lib/device-user-id'

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
  extractedAt?: string | null
  extractedPayPeriodId?: string | null
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

/** One row in the bulk-add modal (12-hour clock + AM/PM). */
interface BulkAddPunchRow {
  id: string
  date: string
  direction: 'in' | 'out'
  hour12: number
  minute: number
  period: 'AM' | 'PM'
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
  return Boolean(dev && deviceUserIdsMatch(log.deviceUserId, dev))
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

interface SelectableDevicePunch {
  key: string
  deviceUserId: string
  recordTime: string
  state?: number
}

interface DeviceSettings {
  zk_device_ip: string
  zk_device_port: string
  /** Canonical HTTPS base URL for ADMS (no trailing slash). Empty = use current browser origin. */
  public_app_url: string
}

type Tab = 'logs' | 'device' | 'agent' | 'instructions'

/** Poll interval for lightweight “anything new?” checks (full load only when hint changes). */
const ATTENDANCE_LOGS_POLL_MS = 45_000

async function fetchAttendanceSyncFingerprint(): Promise<string | null> {
  const r = await fetch('/api/attendance/logs/sync-hint', { cache: 'no-store' })
  if (!r.ok) return null
  const j = (await r.json()) as {
    newestCreatedAt: string | null
    newestNonExtractedCreatedAt: string | null
    newestCorrectedAt: string | null
    stationTodayYmd: string
    payPeriodTick: string
    rawLogsMode: boolean
  }
  return [
    j.newestCreatedAt ?? '',
    j.newestNonExtractedCreatedAt ?? '',
    j.newestCorrectedAt ?? '',
    j.stationTodayYmd,
    j.payPeriodTick,
    j.rawLogsMode ? '1' : '0'
  ].join('|')
}

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

function formatAttendanceSource(source: string): string {
  const s = String(source ?? '')
    .toLowerCase()
    .trim()
  if (s === 'zkteco') return 'ZKTeco'
  if (s === 'manual') return 'Manual'
  return s || '—'
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

function createBulkAddRow(
  partial?: Partial<Pick<BulkAddPunchRow, 'date' | 'direction' | 'hour12' | 'minute' | 'period'>>
): BulkAddPunchRow {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `b_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return {
    id,
    date: partial?.date ?? formatDate(new Date()),
    direction: partial?.direction ?? 'in',
    hour12: partial?.hour12 ?? 9,
    minute: partial?.minute ?? 0,
    period: partial?.period ?? 'AM'
  }
}

function bulkAddRowToApiEntry(row: BulkAddPunchRow): { date: string; punchType: 'in' | 'out'; time: string } {
  const h24 = hour12To24(row.hour12, row.period)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: row.date.trim(),
    punchType: row.direction,
    time: `${pad(h24)}:${pad(row.minute)}`
  }
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
  const [openInstructionId, setOpenInstructionId] = useState<string>('')

  // --- Logs tab state ---
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const loadingRef = useRef(true)
  const syncingRef = useRef(false)
  const syncFingerprintRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Server `ATTENDANCE_RAW_LOGS`: show every punch regardless of extraction. */
  const [rawLogsEnvActive, setRawLogsEnvActive] = useState(false)
  /** Latest saved pay period (banner context only; logs are filtered by extraction, not dates). */
  const [lastFiledPayPeriod, setLastFiledPayPeriod] = useState<{
    start: string
    end: string
    filedAt: string
  } | null>(null)
  const { user } = useAuth()
  const canToggleArchivedLogs = canViewArchivedAttendanceLogs(user?.role ?? '')
  /** Persisted in Attendance settings; only roles in canViewArchivedAttendanceLogs may turn this on. */
  const [showExtractedPunches, setShowExtractedPunches] = useState(false)
  const [staffFilter, setStaffFilter] = useState<string>('')
  /** Narrows the staff list below (name substring, case-insensitive). */
  const [staffSearch, setStaffSearch] = useState('')
  const [expectedPunchesPerDay, setExpectedPunchesPerDay] = useState(4)

  const [editingLog, setEditingLog] = useState<AttendanceLog | null>(null)
  const [editPunchLocal, setEditPunchLocal] = useState('')
  const [editPunchType, setEditPunchType] = useState<'in' | 'out'>('in')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  /** Multi-delete: only non-extracted rows in the current table view. */
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(() => new Set())
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkEditShiftInput, setBulkEditShiftInput] = useState('')
  const [bulkEditTypeAction, setBulkEditTypeAction] = useState<'none' | 'in' | 'out' | 'flip'>('none')
  const [bulkEditSaving, setBulkEditSaving] = useState(false)
  const [bulkEditError, setBulkEditError] = useState<string | null>(null)
  const [bulkActionBanner, setBulkActionBanner] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(
    null
  )
  const bulkSelectAllRef = useRef<HTMLInputElement>(null)

  const [showAddPunch, setShowAddPunch] = useState(false)
  const [addStaffInput, setAddStaffInput] = useState('')
  const [addPunchLocal, setAddPunchLocal] = useState('')
  const [addPunchType, setAddPunchType] = useState<'in' | 'out'>('in')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  type AddPunchHint = {
    id: string
    punchTime: string
    punchType: string
    source: string
    createdAt: string
  }
  const [addPunchHints, setAddPunchHints] = useState<{
    byTime: AddPunchHint | null
    lastSavedManual: AddPunchHint | null
  }>({ byTime: null, lastSavedManual: null })
  const [addLastPunchLoading, setAddLastPunchLoading] = useState(false)

  /** Many manual punches for one staff across one or many calendar days. */
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [bulkAddStaffInput, setBulkAddStaffInput] = useState('')
  const [bulkAddRows, setBulkAddRows] = useState<BulkAddPunchRow[]>([])
  const [bulkAddSaving, setBulkAddSaving] = useState(false)
  const [bulkAddError, setBulkAddError] = useState<string | null>(null)
  const [showSyncPicker, setShowSyncPicker] = useState(false)
  const [syncPickerLoading, setSyncPickerLoading] = useState(false)
  const [syncPickerUploading, setSyncPickerUploading] = useState(false)
  const [syncPickerError, setSyncPickerError] = useState<string | null>(null)
  const [syncPickerResult, setSyncPickerResult] = useState<string | null>(null)
  const [devicePunches, setDevicePunches] = useState<SelectableDevicePunch[]>([])
  const [devicePunchesTotal, setDevicePunchesTotal] = useState<number | null>(null)
  const [selectedDevicePunchKeys, setSelectedDevicePunchKeys] = useState<Set<string>>(() => new Set())

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
  type AdmsHealth = {
    totalAdmsPunches: number
    unmappedCount: number
    last24hCount: number
    last7dCount: number
    manualTotal: number
    distinctSerials: string[]
    latest: {
      punchTime: string
      createdAt: string
      deviceUserId: string
      punchType: string
      source: string
      staffName: string | null
      staffId: string | null
    } | null
  }
  const [admsHealth, setAdmsHealth] = useState<AdmsHealth | null>(null)
  const [admsHealthLoading, setAdmsHealthLoading] = useState(false)
  const [admsHealthError, setAdmsHealthError] = useState<string | null>(null)
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>({
    zk_device_ip: '',
    zk_device_port: '4370',
    public_app_url: ''
  })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    syncingRef.current = syncing
  }, [syncing])

  /** Loads logs (non-extracted by default), pay-period banner metadata, and attendance settings. */
  const refreshAttendanceLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    let shouldUpdateSyncHint = false
    try {
      const periodRes = await fetch('/api/attendance/pay-period?latestSaved=1', { cache: 'no-store' })
      if (!periodRes.ok) throw new Error('Could not load pay period metadata.')
      const meta: unknown = await periodRes.json().catch(() => null)

      const isRecord = (v: unknown): v is Record<string, unknown> =>
        v !== null && typeof v === 'object' && !Array.isArray(v)

      const row = isRecord(meta) ? meta : null
      const rawFromEnv = row?.rawMode === true
      setRawLogsEnvActive(Boolean(rawFromEnv))

      let lastFiled: { start: string; end: string; filedAt: string } | null = null
      if (!rawFromEnv && row && row.lastFiledPeriod && isRecord(row.lastFiledPeriod)) {
        const lp = row.lastFiledPeriod as Record<string, unknown>
        if (
          typeof lp.startDate === 'string' &&
          typeof lp.endDate === 'string' &&
          typeof lp.filedAt === 'string'
        ) {
          lastFiled = { start: lp.startDate, end: lp.endDate, filedAt: lp.filedAt }
        }
      }
      setLastFiledPayPeriod(rawFromEnv ? null : lastFiled)

      const logParams = new URLSearchParams()
      if (!rawFromEnv && canToggleArchivedLogs && showExtractedPunches) {
        logParams.set('includeExtracted', '1')
      }
      const logsUrl =
        logParams.toString().length > 0 ? `/api/attendance/logs?${logParams}` : '/api/attendance/logs'

      const [logsRes, settingsRes, pdRes] = await Promise.all([
        fetch(logsUrl, { cache: 'no-store' }),
        fetch('/api/attendance/settings', { cache: 'no-store' }),
        fetch('/api/pay-days?period=current', { cache: 'no-store' })
      ])

      if (!logsRes.ok) throw new Error('Failed to load logs')
      const rawLogs = await logsRes.json()
      const list: AttendanceLog[] = Array.isArray(rawLogs) ? rawLogs : rawLogs.logs
      setLogs(Array.isArray(list) ? list : [])

      if (settingsRes.ok) {
        const s = (await settingsRes.json()) as {
          expectedPunchesPerDay?: number
          showExtractedPunches?: boolean
        }
        if (typeof s.expectedPunchesPerDay === 'number') {
          setExpectedPunchesPerDay(parseExpectedPunchesPerDay(String(s.expectedPunchesPerDay)))
        }
        if (typeof s.showExtractedPunches === 'boolean') {
          setShowExtractedPunches(s.showExtractedPunches)
        }
      }

      const pdData = await pdRes.json().catch(() => null)
      if (pdRes.ok && pdData && typeof pdData === 'object' && 'payDay' in pdData) {
        const pd = (pdData as { payDay?: { date?: string; notes?: string | null } | null }).payDay
        setCurrentPeriodPayDay(pd?.date ? { date: pd.date, notes: pd.notes ?? null } : null)
      } else {
        setCurrentPeriodPayDay(null)
      }

      setError(null)
      shouldUpdateSyncHint = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      setLogs([])
    } finally {
      setLoading(false)
      if (shouldUpdateSyncHint) {
        void fetchAttendanceSyncFingerprint().then((fp) => {
          if (fp !== null) syncFingerprintRef.current = fp
        })
      }
    }
  }, [showExtractedPunches, canToggleArchivedLogs])

  useEffect(() => {
    if (activeTab !== 'logs') return
    void refreshAttendanceLogs()
  }, [activeTab, refreshAttendanceLogs])

  useEffect(() => {
    if (activeTab !== 'logs') return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshAttendanceLogs()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [activeTab, refreshAttendanceLogs])

  /** Lightweight poll: only runs full reload when sync-hint fingerprint changes. */
  useEffect(() => {
    if (activeTab !== 'logs') return
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      if (loadingRef.current || syncingRef.current) return
      const next = await fetchAttendanceSyncFingerprint()
      if (next === null) return
      if (syncFingerprintRef.current === null) {
        syncFingerprintRef.current = next
        return
      }
      if (next !== syncFingerprintRef.current) {
        void refreshAttendanceLogs()
      }
    }
    const id = window.setInterval(() => void tick(), ATTENDANCE_LOGS_POLL_MS)
    return () => window.clearInterval(id)
  }, [activeTab, refreshAttendanceLogs])

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

  const staffWithDevice = useMemo(() => allStaff.filter((s) => s.deviceUserId), [allStaff])

  const addPunchResolvedStaff = useMemo(
    () => (showAddPunch ? resolveStaffForManualPunch(addStaffInput, staffWithDevice) : null),
    [showAddPunch, addStaffInput, staffWithDevice]
  )

  useEffect(() => {
    if (!showAddPunch) {
      setAddPunchHints({ byTime: null, lastSavedManual: null })
      setAddLastPunchLoading(false)
      return
    }
    const staff = addPunchResolvedStaff
    if (!staff) {
      setAddPunchHints({ byTime: null, lastSavedManual: null })
      setAddLastPunchLoading(false)
      return
    }
    let cancelled = false
    setAddLastPunchLoading(true)
    fetch(`/api/attendance/logs/last-punch?staffId=${encodeURIComponent(staff.id)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('bad')
        return res.json() as Promise<{
          lastByTime: AddPunchHint | null
          lastSavedManual: AddPunchHint | null
        }>
      })
      .then((data) => {
        if (!cancelled) {
          setAddPunchHints({
            byTime: data.lastByTime ?? null,
            lastSavedManual: data.lastSavedManual ?? null
          })
        }
      })
      .catch(() => {
        if (!cancelled) setAddPunchHints({ byTime: null, lastSavedManual: null })
      })
      .finally(() => {
        if (!cancelled) setAddLastPunchLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showAddPunch, addPunchResolvedStaff?.id])

  /** Default punch type: opposite of most recent punch by time (expected next); In if no history. */
  useEffect(() => {
    if (!showAddPunch) return
    if (!addPunchResolvedStaff) {
      setAddPunchType('in')
      return
    }
    if (addLastPunchLoading) return
    const byTime = addPunchHints.byTime
    if (byTime) {
      const t = String(byTime.punchType).toLowerCase().trim()
      setAddPunchType(t === 'out' ? 'in' : 'out')
    } else {
      setAddPunchType('in')
    }
  }, [showAddPunch, addPunchResolvedStaff?.id, addLastPunchLoading, addPunchHints.byTime])

  /** Active staff with device mapping — used for quick-filter tabs. */
  const activeStaffWithDevice = useMemo(
    () => allStaff.filter((s) => s.deviceUserId && s.status !== 'inactive'),
    [allStaff]
  )

  const displayedLogs = useMemo(() => {
    const filtered = !staffFilter
      ? logs
      : (() => {
          const s = staffWithDevice.find((x) => x.id === staffFilter)
          if (!s) return []
          return logs.filter((log) => logBelongsToStaff(log, s))
        })()
    return [...filtered].sort(
      (a, b) => new Date(b.punchTime).getTime() - new Date(a.punchTime).getTime()
    )
  }, [logs, staffFilter, staffWithDevice])

  const deletableLogsInView = useMemo(
    () => displayedLogs.filter((l) => !l.extractedAt),
    [displayedLogs]
  )

  const selectedDeletableCount = useMemo(
    () => deletableLogsInView.reduce((n, l) => n + (selectedLogIds.has(l.id) ? 1 : 0), 0),
    [deletableLogsInView, selectedLogIds]
  )

  useEffect(() => {
    const allowed = new Set(deletableLogsInView.map((l) => l.id))
    setSelectedLogIds((prev) => {
      let needsPrune = false
      for (const id of prev) {
        if (!allowed.has(id)) {
          needsPrune = true
          break
        }
      }
      if (!needsPrune) return prev
      const next = new Set<string>()
      for (const id of prev) {
        if (allowed.has(id)) next.add(id)
      }
      return next
    })
  }, [deletableLogsInView])

  useEffect(() => {
    const el = bulkSelectAllRef.current
    if (!el) return
    const total = deletableLogsInView.length
    const sel = selectedDeletableCount
    el.indeterminate = sel > 0 && sel < total
  }, [deletableLogsInView.length, selectedDeletableCount])

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

  const fetchAdmsHealth = useCallback(async () => {
    setAdmsHealthLoading(true)
    setAdmsHealthError(null)
    try {
      const res = await fetch('/api/attendance/adms-health', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setAdmsHealth(data as AdmsHealth)
    } catch (e) {
      setAdmsHealth(null)
      setAdmsHealthError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setAdmsHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'device') void fetchAdmsHealth()
  }, [activeTab, fetchAdmsHealth])

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

  const toggleLogSelected = (log: AttendanceLog) => {
    if (log.extractedAt) return
    setBulkActionBanner(null)
    setSelectedLogIds((prev) => {
      const next = new Set(prev)
      if (next.has(log.id)) next.delete(log.id)
      else next.add(log.id)
      return next
    })
  }

  const selectAllDeletableInView = () => {
    setBulkActionBanner(null)
    setSelectedLogIds(new Set(deletableLogsInView.map((l) => l.id)))
  }

  const clearLogSelection = () => {
    setBulkActionBanner(null)
    setSelectedLogIds(new Set())
  }

  const openBulkDeleteConfirm = () => {
    if (selectedDeletableCount === 0) return
    setBulkDeleteConfirmOpen(true)
  }

  const closeBulkDeleteConfirm = () => {
    if (bulkDeleting) return
    setBulkDeleteConfirmOpen(false)
  }

  const handleConfirmBulkDelete = async () => {
    const ids = deletableLogsInView.filter((l) => selectedLogIds.has(l.id)).map((l) => l.id)
    if (ids.length === 0) {
      setBulkDeleteConfirmOpen(false)
      return
    }
    setBulkDeleting(true)
    setBulkActionBanner(null)
    try {
      const outcomes = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/attendance/logs/${id}`, { method: 'DELETE' })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              return {
                ok: false as const,
                error: typeof data.error === 'string' ? data.error : 'Failed to delete'
              }
            }
            return { ok: true as const }
          } catch {
            return { ok: false as const, error: 'Network error' }
          }
        })
      )
      const okCount = outcomes.filter((o) => o.ok).length
      const failCount = outcomes.length - okCount
      const errMsgs = [...new Set(outcomes.filter((o) => !o.ok).map((o) => o.error))]
      setBulkDeleteConfirmOpen(false)
      setSelectedLogIds(new Set())
      await refreshAttendanceLogs()
      if (failCount === 0) {
        setBulkActionBanner({
          kind: 'success',
          text:
            okCount === 1
              ? 'Deleted 1 punch.'
              : `Deleted ${okCount} punches.`
        })
      } else if (okCount === 0) {
        setBulkActionBanner({
          kind: 'error',
          text: `Could not delete any punches. ${errMsgs.slice(0, 3).join(' ')}${errMsgs.length > 3 ? ' …' : ''}`
        })
      } else {
        setBulkActionBanner({
          kind: 'warning',
          text: `Deleted ${okCount} of ${ids.length}. ${failCount} could not be removed. ${errMsgs.slice(0, 2).join(' ')}${errMsgs.length > 2 ? ' …' : ''}`
        })
      }
    } finally {
      setBulkDeleting(false)
    }
  }

  const openBulkEdit = () => {
    if (selectedDeletableCount === 0) return
    setBulkActionBanner(null)
    setBulkEditError(null)
    setBulkEditShiftInput('')
    setBulkEditTypeAction('none')
    setBulkEditOpen(true)
  }

  const closeBulkEdit = () => {
    if (bulkEditSaving) return
    setBulkEditOpen(false)
    setBulkEditError(null)
  }

  const handleApplyBulkEdit = async () => {
    const ids = deletableLogsInView.filter((l) => selectedLogIds.has(l.id)).map((l) => l.id)
    if (ids.length === 0) {
      setBulkEditError('No punches selected.')
      return
    }

    const rawShift = bulkEditShiftInput.trim()
    let shiftMinutes: number | undefined
    if (rawShift !== '') {
      const n = Math.trunc(Number(rawShift))
      if (!Number.isFinite(n)) {
        setBulkEditError('Shift minutes must be a whole number (for example 15 or -30).')
        return
      }
      shiftMinutes = n
    }

    const hasShift = shiftMinutes !== undefined && shiftMinutes !== 0
    const hasType = bulkEditTypeAction !== 'none'
    if (!hasShift && !hasType) {
      setBulkEditError('Enter a non-zero time shift and/or choose a punch type change.')
      return
    }

    setBulkEditSaving(true)
    setBulkEditError(null)
    try {
      const body: { ids: string[]; shiftMinutes?: number; setPunchType?: 'in' | 'out' | 'flip' } = { ids }
      if (hasShift && shiftMinutes !== undefined) body.shiftMinutes = shiftMinutes
      if (hasType) body.setPunchType = bulkEditTypeAction

      const res = await fetch('/api/attendance/logs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBulkEditError(typeof data.error === 'string' ? data.error : 'Bulk update failed')
        return
      }
      const updated = typeof data.updated === 'number' ? data.updated : 0
      setBulkEditOpen(false)
      setBulkEditShiftInput('')
      setBulkEditTypeAction('none')
      setSelectedLogIds(new Set())
      await refreshAttendanceLogs()
      setBulkActionBanner({
        kind: 'success',
        text:
          updated === 0
            ? (typeof data.message === 'string' ? data.message : 'No rows needed changes.')
            : updated === 1
              ? 'Updated 1 punch.'
              : `Updated ${updated} punches.`
      })
    } catch {
      setBulkEditError('Network error — try again.')
    } finally {
      setBulkEditSaving(false)
    }
  }

  const openEditLog = (log: AttendanceLog) => {
    if (log.extractedAt) return
    setShowAddPunch(false)
    setShowBulkAdd(false)
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
    setShowBulkAdd(false)
    setAddError(null)
    const fromFilter = staffWithDevice.find((s) => s.id === staffFilter)
    const fallback = staffWithDevice[0]
    // Show name in the field (device user ID is still accepted when typed — see resolveStaffForManualPunch).
    setAddStaffInput(fromFilter?.name?.trim() ?? fallback?.name?.trim() ?? '')
    setAddPunchLocal(nowDatetimeLocalValue())
    setAddPunchType('in')
    setShowAddPunch(true)
  }

  const closeAddPunch = () => {
    if (addSaving) return
    setShowAddPunch(false)
    setAddError(null)
  }

  const openBulkAddPunches = () => {
    setEditingLog(null)
    setShowAddPunch(false)
    setBulkAddError(null)
    const fromFilter = staffWithDevice.find((s) => s.id === staffFilter)
    const fallback = staffWithDevice[0]
    setBulkAddStaffInput(fromFilter?.name?.trim() ?? fallback?.name?.trim() ?? '')
    setBulkAddRows([createBulkAddRow({ date: formatDate(new Date()) })])
    setShowBulkAdd(true)
  }

  const closeBulkAddPunches = () => {
    if (bulkAddSaving) return
    setShowBulkAdd(false)
    setBulkAddError(null)
  }

  const handleSaveBulkAddPunches = async () => {
    const staff = resolveStaffForManualPunch(bulkAddStaffInput, staffWithDevice)
    if (!staff) {
      setBulkAddError(
        'Enter the device user ID (number from the ZKTeco device), or pick a staff name from the suggestions.'
      )
      return
    }
    if (bulkAddRows.length === 0) {
      setBulkAddError('Add at least one punch line using the + button below.')
      return
    }
    const badDateIdx = bulkAddRows.findIndex((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.date.trim()))
    if (badDateIdx >= 0) {
      setBulkAddError(`Line ${badDateIdx + 1}: choose a valid date.`)
      return
    }
    const entries = bulkAddRows.map(bulkAddRowToApiEntry)
    setBulkAddSaving(true)
    setBulkAddError(null)
    try {
      const res = await fetch('/api/attendance/logs/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: staff.id,
          entries
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBulkAddError(typeof data.error === 'string' ? data.error : 'Bulk add failed')
        return
      }
      const created = typeof data.created === 'number' ? data.created : 0
      setShowBulkAdd(false)
      setBulkAddRows([])
      setBulkActionBanner({
        kind: 'success',
        text:
          created === 0
            ? 'No punches were added.'
            : created === 1
              ? 'Added 1 punch.'
              : `Added ${created} punches.`
      })
      await refreshAttendanceLogs()
    } catch {
      setBulkAddError('Network error — try again.')
    } finally {
      setBulkAddSaving(false)
    }
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
      await refreshAttendanceLogs()
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
      await refreshAttendanceLogs()
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
      setSelectedLogIds((prev) => {
        if (!prev.has(editingLog.id)) return prev
        const next = new Set(prev)
        next.delete(editingLog.id)
        return next
      })
      closeEditLog()
      await refreshAttendanceLogs()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setEditSaving(false)
    }
  }

  const loadDevicePunchSelection = useCallback(async () => {
    setSyncing(true)
    setSyncPickerLoading(true)
    setSyncPickerError(null)
    setSyncPickerResult(null)
    try {
      const res = await fetch('/api/attendance/sync/punches?limit=2000', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        const parts = [data.error, data.hint].filter(Boolean)
        throw new Error(parts.length ? parts.join('\n\n') : 'Could not load punches from device')
      }
      const punches = Array.isArray(data.punches) ? data.punches : []
      setDevicePunches(punches)
      setDevicePunchesTotal(
        typeof data.totalOnDevice === 'number' ? data.totalOnDevice : punches.length
      )
      setSelectedDevicePunchKeys(new Set())
    } catch (err) {
      setSyncPickerError(err instanceof Error ? err.message : 'Could not load punches from device')
      setDevicePunches([])
      setDevicePunchesTotal(null)
      setSelectedDevicePunchKeys(new Set())
    } finally {
      setSyncPickerLoading(false)
      setSyncing(false)
    }
  }, [])

  const openSyncPicker = useCallback(() => {
    setShowSyncPicker(true)
    void loadDevicePunchSelection()
  }, [loadDevicePunchSelection])

  const closeSyncPicker = useCallback(() => {
    if (syncPickerUploading) return
    setShowSyncPicker(false)
    setSyncPickerError(null)
    setSyncPickerResult(null)
  }, [syncPickerUploading])

  const handleUploadSelectedPunches = async () => {
    const payload = devicePunches
      .filter((p) => selectedDevicePunchKeys.has(p.key))
      .map((p) => ({ deviceUserId: p.deviceUserId, recordTime: p.recordTime, state: p.state }))
    if (payload.length === 0) {
      setSyncPickerError('Select at least one punch.')
      return
    }

    setSyncing(true)
    setSyncPickerUploading(true)
    setSyncPickerError(null)
    setSyncPickerResult(null)
    try {
      const res = await fetch('/api/attendance/sync/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: payload })
      })
      const data = await res.json()
      if (!res.ok) {
        const parts = [data.error, data.hint].filter(Boolean)
        throw new Error(parts.length ? parts.join('\n\n') : 'Upload failed')
      }
      const total = typeof data.total === 'number' ? data.total : payload.length
      const synced = typeof data.synced === 'number' ? data.synced : 0
      setSyncPickerResult(`Accepted ${total} punch${total === 1 ? '' : 'es'}; ${synced} new row${synced === 1 ? '' : 's'} saved.`)
      await refreshAttendanceLogs()
      setSelectedDevicePunchKeys(new Set())
    } catch (err) {
      setSyncPickerError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setSyncPickerUploading(false)
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
      return { displayHm: '—' as const, displayDecimal: '—' as const, caption: 'Hours this pay period', title }
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
          {(
            [
              { id: 'logs' as const, label: 'Attendance Logs' },
              { id: 'device' as const, label: 'Device Management' },
              { id: 'agent' as const, label: 'Windows Agent' },
              { id: 'instructions' as const, label: 'Instructions' }
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── LOGS TAB ── */}
        {activeTab === 'logs' && (
          <>
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={openSyncPicker}
                  disabled={syncing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {syncing ? 'Working…' : 'Sync from device'}
                </button>
                <button
                  type="button"
                  onClick={openAddPunch}
                  disabled={staffWithDevice.length === 0}
                  title={
                    staffWithDevice.length === 0
                      ? 'Map staff to device users on the Windows Agent tab (or edit staff profiles) first'
                      : 'Record a missed clock-in or clock-out'
                  }
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add punch
                </button>
                <button
                  type="button"
                  onClick={openBulkAddPunches}
                  disabled={staffWithDevice.length === 0}
                  title={
                    staffWithDevice.length === 0
                      ? 'Map staff to device users first'
                      : 'Add several punches for one person on one day (one line per time)'
                  }
                  className="px-4 py-2 border border-emerald-600 text-emerald-800 bg-white rounded-lg font-semibold hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Bulk add…
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {lastFiledPayPeriod && (
                  <span className="text-sm text-gray-600">
                    <span className="text-gray-600">Last filed pay period: </span>
                    <span className="font-medium text-gray-800">
                      {formatDateDisplay(lastFiledPayPeriod.start + 'T12:00:00')} —{' '}
                      {formatDateDisplay(lastFiledPayPeriod.end + 'T12:00:00')}
                    </span>
                  </span>
                )}

                {canToggleArchivedLogs && (
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showExtractedPunches}
                      onChange={(e) => {
                        const v = e.target.checked
                        void (async () => {
                          try {
                            const res = await fetch('/api/attendance/settings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ showExtractedPunches: v })
                            })
                            if (!res.ok) throw new Error('Failed to save')
                            setShowExtractedPunches(v)
                            void refreshAttendanceLogs()
                          } catch {
                            setShowExtractedPunches(!v)
                          }
                        })()
                      }}
                      className="rounded border-gray-300"
                    />
                    Show extracted (filed) punches
                  </label>
                )}

                {irregularityCount > 0 && (
                  <div className="ml-auto px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm font-medium">
                    {irregularityCount} irregularit{irregularityCount === 1 ? 'y' : 'ies'} need attention
                  </div>
                )}
              </div>
            </div>

            {rawLogsEnvActive && !error && (
              <p className="text-xs text-amber-900 mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-2">
                <span className="font-semibold">Raw logs mode.</span>{' '}
                <code className="rounded bg-amber-100/80 px-1">ATTENDANCE_RAW_LOGS</code> is enabled on the server — extraction
                filtering is bypassed and every punch is listed. Remove it from env for normal filing behavior.
              </p>
            )}

            {!rawLogsEnvActive && !error && (
              <p className="text-xs text-gray-600 mb-2">
                <span className="font-medium text-gray-800">Attendance list:</span> punches that are{' '}
                <span className="font-medium text-gray-800">not yet extracted</span> (not included in a saved Pay Period Report).
                Saving a report marks matching punches as extracted; they stay in the database but are hidden here unless you
                turn on <strong>Show extracted (filed) punches</strong> (admin/manager/operations manager) or enable them under{' '}
                <Link href="/attendance/settings" className="font-medium text-blue-600 hover:text-blue-800">
                  Attendance settings
                </Link>
                . Extracted rows are view-only.
              </p>
            )}

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
              {bulkActionBanner && (
                <div
                  className={`px-3 py-2 text-sm border-b ${
                    bulkActionBanner.kind === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-100'
                      : bulkActionBanner.kind === 'warning'
                        ? 'bg-amber-50 text-amber-950 border-amber-100'
                        : 'bg-red-50 text-red-900 border-red-100'
                  }`}
                >
                  {bulkActionBanner.text}
                </div>
              )}
              {selectedDeletableCount > 0 && (
                <div
                  className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-100 bg-slate-50/90"
                  role="region"
                  aria-label="Bulk actions for selected punches"
                >
                  <span className="text-sm font-medium text-gray-800">
                    {selectedDeletableCount} selected
                  </span>
                  <button
                    type="button"
                    onClick={clearLogSelection}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={openBulkEdit}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Bulk edit…
                  </button>
                  <button
                    type="button"
                    onClick={openBulkDeleteConfirm}
                    className="ml-auto rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Delete selected
                  </button>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr className="border-b border-gray-200 bg-slate-50">
                      <td colSpan={7} className="px-3 py-2 text-left text-xs font-medium text-gray-600">
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
                      <th className="px-2 py-2 w-10 text-left font-semibold text-gray-700" scope="col">
                        <span className="sr-only">Select for bulk delete or bulk edit</span>
                        <input
                          ref={bulkSelectAllRef}
                          type="checkbox"
                          disabled={deletableLogsInView.length === 0 || loading}
                          checked={
                            deletableLogsInView.length > 0 &&
                            selectedDeletableCount === deletableLogsInView.length
                          }
                          onChange={() => {
                            if (deletableLogsInView.length === 0) return
                            if (selectedDeletableCount === deletableLogsInView.length) {
                              clearLogSelection()
                            } else {
                              selectAllDeletableInView()
                            }
                          }}
                          className="rounded border-gray-300 align-middle"
                          title="Select all deletable punches in this list"
                          aria-label="Select all deletable punches in this list"
                        />
                      </th>
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
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">Loading…</td></tr>
                    ) : displayedLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                          {staffFilter
                            ? 'No attendance logs for this staff in the current view.'
                            : 'No attendance logs in the current view. Sync from the device, or use Add punch for a missed clock-in/out.'}
                        </td>
                      </tr>
                    ) : (
                      displayedLogs.map((log) => {
                        const st = punchDayStatusById.get(log.id) ?? 'irregular'
                        const isExtracted = Boolean(log.extractedAt)
                        const rowBg = isExtracted
                          ? 'bg-violet-50/95 ring-1 ring-violet-100/80'
                          : st === 'irregular'
                            ? 'bg-red-50/50'
                            : st === 'short_ok'
                              ? 'bg-sky-50/50'
                              : 'bg-emerald-50/35'
                        return (
                        <tr key={log.id} className={`border-t border-gray-100 hover:bg-gray-50 ${rowBg}`}>
                          <td className="px-2 py-2 align-middle">
                            {isExtracted ? (
                              <span
                                className="inline-block w-4 h-4 shrink-0 rounded border border-violet-200 bg-violet-50"
                                title="Filed — cannot delete"
                                aria-hidden
                              />
                            ) : (
                              <input
                                type="checkbox"
                                checked={selectedLogIds.has(log.id)}
                                onChange={() => toggleLogSelected(log)}
                                className="rounded border-gray-300"
                                aria-label={`Select punch ${formatDateDisplay(log.punchTime)} ${formatTime(log.punchTime)} ${log.punchType === 'in' ? 'In' : 'Out'}`}
                              />
                            )}
                          </td>
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
                            {isExtracted && (
                              <span
                                className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-violet-200 text-violet-900"
                                title="Included in a saved Pay Period Report — view only"
                              >
                                Filed
                              </span>
                            )}
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
                            {isExtracted ? (
                              <span className="text-xs font-medium text-violet-800">View only</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openEditLog(log)}
                                className="text-sm font-medium text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                            )}
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

            {showSyncPicker && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sync-picker-title"
              >
                <div className="bg-white rounded-lg border border-gray-200 shadow-xl max-w-3xl w-full p-5 max-h-[90vh] overflow-y-auto">
                  <h2 id="sync-picker-title" className="text-lg font-semibold text-gray-900 mb-1">
                    Sync from device (select punches)
                  </h2>
                  <p className="text-sm text-gray-600 mb-3">
                    Load punches from the terminal, choose rows, then upload only the selected punches.
                  </p>
                  {syncPickerError && (
                    <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-line">
                      {syncPickerError}
                    </div>
                  )}
                  {syncPickerResult && (
                    <div className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 whitespace-pre-line">
                      {syncPickerResult}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => void loadDevicePunchSelection()}
                      disabled={syncPickerLoading || syncPickerUploading}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {syncPickerLoading ? 'Loading…' : 'Reload from device'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDevicePunchKeys(new Set(devicePunches.map((p) => p.key)))
                      }
                      disabled={syncPickerLoading || syncPickerUploading || devicePunches.length === 0}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDevicePunchKeys(new Set())}
                      disabled={syncPickerUploading || selectedDevicePunchKeys.size === 0}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Clear
                    </button>
                    <span className="ml-auto text-xs text-gray-500">
                      {devicePunches.length === 0
                        ? 'No punches loaded.'
                        : `Showing ${devicePunches.length} of ${devicePunchesTotal ?? devicePunches.length} punch(es)`}
                    </span>
                  </div>
                  <div className="max-h-[48vh] overflow-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="text-left text-gray-700">
                          <th className="px-3 py-2 font-semibold w-12">Pick</th>
                          <th className="px-3 py-2 font-semibold">Device user</th>
                          <th className="px-3 py-2 font-semibold">Punch time</th>
                          <th className="px-3 py-2 font-semibold">State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {devicePunches.length === 0 ? (
                          <tr>
                            <td className="px-3 py-6 text-center text-gray-500" colSpan={4}>
                              {syncPickerLoading ? 'Loading punches…' : 'No punches found.'}
                            </td>
                          </tr>
                        ) : (
                          devicePunches.map((p) => {
                            const checked = selectedDevicePunchKeys.has(p.key)
                            return (
                              <tr key={p.key} className="border-t border-gray-100">
                                <td className="px-3 py-2 align-top">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setSelectedDevicePunchKeys((prev) => {
                                        const next = new Set(prev)
                                        if (e.target.checked) next.add(p.key)
                                        else next.delete(p.key)
                                        return next
                                      })
                                    }
                                    disabled={syncPickerUploading}
                                  />
                                </td>
                                <td className="px-3 py-2 font-mono text-gray-800">{p.deviceUserId}</td>
                                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                  {new Date(p.recordTime).toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {typeof p.state === 'number' ? p.state : '—'}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      type="button"
                      onClick={closeSyncPicker}
                      disabled={syncPickerUploading}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleUploadSelectedPunches()}
                      disabled={syncPickerUploading || syncPickerLoading || selectedDevicePunchKeys.size === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {syncPickerUploading ? 'Uploading…' : `Upload selected (${selectedDevicePunchKeys.size})`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showBulkAdd && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bulk-add-title"
              >
                <div className="bg-white rounded-lg border border-gray-200 shadow-xl max-w-xl w-full p-5 max-h-[90vh] overflow-y-auto">
                  <h2 id="bulk-add-title" className="text-lg font-semibold text-gray-900 mb-1">
                    Bulk add punches
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Choose staff, then add punch rows (each row can be a different day). Times use the{' '}
                    <strong>station time zone</strong> (same as pay-day / attendance settings), not necessarily your
                    browser&apos;s zone.
                  </p>
                  {bulkAddError && (
                    <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 whitespace-pre-line">
                      {bulkAddError}
                    </div>
                  )}
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bulk-add-staff">
                        Staff
                      </label>
                      <input
                        id="bulk-add-staff"
                        type="text"
                        list="bulk-add-staff-datalist"
                        value={bulkAddStaffInput}
                        onChange={(e) => setBulkAddStaffInput(e.target.value)}
                        placeholder="Device user ID or name"
                        autoComplete="off"
                        disabled={bulkAddSaving}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                      <datalist id="bulk-add-staff-datalist">
                        {staffWithDevice.map((s) => (
                          <option key={s.id} value={s.name}>
                            {`Device user ${s.deviceUserId ?? '—'}`}
                          </option>
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-700">Punch times</span>
                        <button
                          type="button"
                          onClick={() =>
                            setBulkAddRows((rows) => {
                              const last = rows[rows.length - 1]
                              return [...rows, createBulkAddRow({ date: last?.date ?? formatDate(new Date()) })]
                            })
                          }
                          disabled={bulkAddSaving}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          <span className="text-lg leading-none" aria-hidden>
                            +
                          </span>
                          Add line
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[min(22rem,50vh)] overflow-y-auto pr-1">
                        {bulkAddRows.length === 0 ? (
                          <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center">
                            No lines yet — click <strong>+ Add line</strong> to add a punch.
                          </p>
                        ) : (
                          bulkAddRows.map((row, idx) => (
                            <div
                              key={row.id}
                              className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-gray-50/90 px-3 py-2.5"
                              role="group"
                              aria-label={`Punch line ${idx + 1}`}
                            >
                              <div className="min-w-[10rem]">
                                <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-0.5">
                                  Date
                                </label>
                                <input
                                  type="date"
                                  value={row.date}
                                  onChange={(e) =>
                                    setBulkAddRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, date: e.target.value } : r))
                                    )
                                  }
                                  disabled={bulkAddSaving}
                                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm"
                                />
                              </div>
                              <div className="min-w-[6.5rem]">
                                <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-0.5">
                                  In / out
                                </label>
                                <select
                                  value={row.direction}
                                  onChange={(e) =>
                                    setBulkAddRows((rows) =>
                                      rows.map((r) =>
                                        r.id === row.id
                                          ? { ...r, direction: e.target.value as 'in' | 'out' }
                                          : r
                                      )
                                    )
                                  }
                                  disabled={bulkAddSaving}
                                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm font-medium text-gray-900 shadow-sm"
                                >
                                  <option value="in">In (+)</option>
                                  <option value="out">Out (−)</option>
                                </select>
                              </div>
                              <div className="flex flex-wrap items-end gap-1.5">
                                <TimeSpinInput
                                  label="Hour"
                                  value={row.hour12}
                                  min={1}
                                  max={12}
                                  pad={false}
                                  disabled={bulkAddSaving}
                                  onChange={(hour12) =>
                                    setBulkAddRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, hour12 } : r))
                                    )
                                  }
                                  onIncrement={() =>
                                    setBulkAddRows((rows) =>
                                      rows.map((r) => {
                                        if (r.id !== row.id) return r
                                        const h = r.hour12 >= 12 ? 1 : r.hour12 + 1
                                        return { ...r, hour12: h }
                                      })
                                    )
                                  }
                                  onDecrement={() =>
                                    setBulkAddRows((rows) =>
                                      rows.map((r) => {
                                        if (r.id !== row.id) return r
                                        const h = r.hour12 <= 1 ? 12 : r.hour12 - 1
                                        return { ...r, hour12: h }
                                      })
                                    )
                                  }
                                />
                                <span className="self-center pb-1 text-xl font-light text-gray-400 select-none" aria-hidden>
                                  :
                                </span>
                                <TimeSpinInput
                                  label="Minute"
                                  value={row.minute}
                                  min={0}
                                  max={59}
                                  pad
                                  disabled={bulkAddSaving}
                                  onChange={(minute) =>
                                    setBulkAddRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, minute } : r))
                                    )
                                  }
                                  onIncrement={() =>
                                    setBulkAddRows((rows) =>
                                      rows.map((r) =>
                                        r.id === row.id ? { ...r, minute: r.minute >= 59 ? 0 : r.minute + 1 } : r
                                      )
                                    )
                                  }
                                  onDecrement={() =>
                                    setBulkAddRows((rows) =>
                                      rows.map((r) =>
                                        r.id === row.id ? { ...r, minute: r.minute <= 0 ? 59 : r.minute - 1 } : r
                                      )
                                    )
                                  }
                                />
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                    AM / PM
                                  </span>
                                  <select
                                    id={`bulk-add-ampm-${row.id}`}
                                    value={row.period}
                                    onChange={(e) =>
                                      setBulkAddRows((rows) =>
                                        rows.map((r) =>
                                          r.id === row.id
                                            ? { ...r, period: e.target.value as 'AM' | 'PM' }
                                            : r
                                        )
                                      )
                                    }
                                    disabled={bulkAddSaving}
                                    className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm font-semibold text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                  >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                  </select>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setBulkAddRows((rows) => rows.filter((r) => r.id !== row.id))
                                }
                                disabled={bulkAddSaving}
                                className="ml-auto rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-red-800 disabled:opacity-50"
                                aria-label={`Remove punch line ${idx + 1}`}
                              >
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        <strong>In (+)</strong> and <strong>Out (−)</strong> match a normal clock sequence. Use{' '}
                        <strong>+ Add line</strong> for each extra punch across one or many dates for this staff.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeBulkAddPunches}
                      disabled={bulkAddSaving}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveBulkAddPunches()}
                      disabled={bulkAddSaving}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {bulkAddSaving ? 'Saving…' : 'Add punches'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showAddPunch && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-punch-title"
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
                          <option key={s.id} value={s.name}>
                            {`Device user ${s.deviceUserId ?? '—'}`}
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
                  <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="text-xs text-gray-600 min-w-0 sm:max-w-[58%]">
                      {!addPunchResolvedStaff && (
                        <span className="text-gray-500">
                          Select staff to see their most recent punch time and last saved manual entry.
                        </span>
                      )}
                      {addPunchResolvedStaff && addLastPunchLoading && (
                        <span className="text-gray-500">Loading punch hints…</span>
                      )}
                      {addPunchResolvedStaff &&
                        !addLastPunchLoading &&
                        !addPunchHints.byTime &&
                        !addPunchHints.lastSavedManual && (
                          <span className="text-gray-500">No punches on file for this staff yet.</span>
                        )}
                      {addPunchResolvedStaff && !addLastPunchLoading && addPunchHints.byTime && (
                        <div className="space-y-2">
                          <div>
                            <div className="font-medium text-gray-800">Most recent punch time</div>
                            <div className="mt-0.5 text-gray-600 leading-snug">
                              {new Date(addPunchHints.byTime.punchTime).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              })}
                              {' · '}
                              <span
                                className={
                                  String(addPunchHints.byTime.punchType).toLowerCase() === 'out'
                                    ? 'font-medium text-emerald-600'
                                    : 'font-medium text-red-600'
                                }
                              >
                                {String(addPunchHints.byTime.punchType).toLowerCase() === 'out' ? 'Out' : 'In'}
                              </span>
                              {' · '}
                              <span className="text-gray-500">
                                Source: {formatAttendanceSource(addPunchHints.byTime.source)}
                              </span>
                            </div>
                          </div>
                          {addPunchHints.lastSavedManual &&
                            addPunchHints.lastSavedManual.id !== addPunchHints.byTime.id && (
                              <div>
                                <div className="font-medium text-gray-800">Last manual entry saved</div>
                                <div className="mt-0.5 text-gray-600 leading-snug">
                                  Clock:{' '}
                                  {new Date(addPunchHints.lastSavedManual.punchTime).toLocaleString(undefined, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short'
                                  })}
                                  {' · '}
                                  <span
                                    className={
                                      String(addPunchHints.lastSavedManual.punchType).toLowerCase() === 'out'
                                        ? 'font-medium text-emerald-600'
                                        : 'font-medium text-red-600'
                                    }
                                  >
                                    {String(addPunchHints.lastSavedManual.punchType).toLowerCase() === 'out'
                                      ? 'Out'
                                      : 'In'}
                                  </span>
                                  {' · '}
                                  <span className="text-gray-500">
                                    Saved:{' '}
                                    {new Date(addPunchHints.lastSavedManual.createdAt).toLocaleString(undefined, {
                                      dateStyle: 'medium',
                                      timeStyle: 'short'
                                    })}
                                  </span>
                                </div>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 shrink-0">
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
              </div>
            )}

            {editingLog && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-punch-title"
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

            {bulkEditOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bulk-edit-title"
              >
                <div className="bg-white rounded-lg border border-gray-200 shadow-xl max-w-lg w-full p-5">
                  <h2 id="bulk-edit-title" className="text-lg font-semibold text-gray-900 mb-1">
                    Bulk edit {selectedDeletableCount} punch{selectedDeletableCount === 1 ? '' : 'es'}
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Shift every selected punch by the same number of minutes (for clock drift or wrong time zone), and/or
                    fix in/out labels together. Filed punches cannot be edited — they are not selectable here.
                  </p>
                  {bulkEditError && (
                    <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {bulkEditError}
                    </div>
                  )}
                  <div className="space-y-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bulk-edit-shift">
                        Shift all times (minutes)
                      </label>
                      <input
                        id="bulk-edit-shift"
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 15 or -30 (leave blank for no time change)"
                        value={bulkEditShiftInput}
                        onChange={(e) => setBulkEditShiftInput(e.target.value)}
                        disabled={bulkEditSaving}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                      <p className="mt-1 text-xs text-gray-500">Whole minutes only. Positive moves punches later.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bulk-edit-type">
                        Punch type
                      </label>
                      <select
                        id="bulk-edit-type"
                        value={bulkEditTypeAction}
                        onChange={(e) => setBulkEditTypeAction(e.target.value as 'none' | 'in' | 'out' | 'flip')}
                        disabled={bulkEditSaving}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="none">No change</option>
                        <option value="in">Set all to In</option>
                        <option value="out">Set all to Out</option>
                        <option value="flip">Flip In ↔ Out on each row</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeBulkEdit}
                      disabled={bulkEditSaving}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApplyBulkEdit()}
                      disabled={bulkEditSaving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {bulkEditSaving ? 'Applying…' : 'Apply to selected'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {bulkDeleteConfirmOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bulk-delete-title"
              >
                <div className="bg-white rounded-lg border border-gray-200 shadow-xl max-w-lg w-full p-5">
                  <h2 id="bulk-delete-title" className="text-lg font-semibold text-gray-900 mb-1">
                    Delete {selectedDeletableCount} punch{selectedDeletableCount === 1 ? '' : 'es'}?
                  </h2>
                  <p className="text-sm text-gray-600 mb-3">
                    This cannot be undone. Use only for duplicate or mistaken entries. Filed punches cannot be removed.
                  </p>
                  <ul className="mb-4 max-h-48 overflow-y-auto rounded-md border border-gray-100 bg-gray-50/80 text-sm text-gray-800 divide-y divide-gray-100">
                    {deletableLogsInView
                      .filter((l) => selectedLogIds.has(l.id))
                      .slice(0, 12)
                      .map((l) => (
                        <li key={l.id} className="px-3 py-2 flex flex-wrap gap-x-2 gap-y-0.5">
                          <span className="font-medium">{l.staff?.name ?? l.deviceUserName ?? `Device ${l.deviceUserId}`}</span>
                          <span className="text-gray-600">
                            {formatDateDisplay(l.punchTime)} · {formatTime(l.punchTime)} ·{' '}
                            {l.punchType === 'in' ? 'In' : 'Out'}
                          </span>
                        </li>
                      ))}
                  </ul>
                  {selectedDeletableCount > 12 && (
                    <p className="text-xs text-gray-500 mb-4">
                      And {selectedDeletableCount - 12} more — all selected punches will be deleted.
                    </p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeBulkDeleteConfirm}
                      disabled={bulkDeleting}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmBulkDelete()}
                      disabled={bulkDeleting}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                    >
                      {bulkDeleting ? 'Deleting…' : 'Delete punches'}
                    </button>
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
                  {' '} — Use &ldquo;Sync from device&rdquo; on the Logs tab when on the same network, or use <strong>ADMS</strong> on the device for automatic punch delivery; the Windows Agent handles staff-to-device sync and optional manual punch upload from its local dashboard.
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

            {/* ADMS health — rows in DB from cloud push */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-semibold text-gray-900">ADMS activity (this database)</h2>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Counts only punches stored from the device push (<code className="bg-gray-100 px-1 rounded text-xs">source</code> starts with{' '}
                    <code className="bg-gray-100 px-1 rounded text-xs">adms:</code>). If recent counts stay at0 but Vercel shows POSTs, the device may be sending{' '}
                    <strong>OPERLOG</strong> instead of <strong>ATTLOG</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchAdmsHealth()}
                  disabled={admsHealthLoading}
                  className="shrink-0 px-3 py-1.5 text-sm font-semibold border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  {admsHealthLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              {admsHealthError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{admsHealthError}</div>
              )}
              {!admsHealthLoading && admsHealth && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500">ADMS rows (all time)</div>
                      <div className="text-lg font-bold text-gray-900 tabular-nums">{admsHealth.totalAdmsPunches}</div>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500">Last 24 hours</div>
                      <div className="text-lg font-bold text-gray-900 tabular-nums">{admsHealth.last24hCount}</div>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500">Last 7 days</div>
                      <div className="text-lg font-bold text-gray-900 tabular-nums">{admsHealth.last7dCount}</div>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500">Manual rows (all time)</div>
                      <div className="text-lg font-bold text-gray-900 tabular-nums">{admsHealth.manualTotal}</div>
                    </div>
                  </div>
                  {admsHealth.unmappedCount > 0 && (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
                      <strong>{admsHealth.unmappedCount}</strong> ADMS punch(es) are not linked to a staff profile (
                      <code className="bg-amber-100/80 px-1 rounded">staff_id</code> null). Match{' '}
                      <strong>Device User ID</strong> on the terminal to <strong>Device User ID</strong> on each staff profile.
                    </p>
                  )}
                  {admsHealth.distinctSerials.length > 0 && (
                    <p className="text-xs text-gray-600">
                      Device serial(s) seen:{' '}
                      <span className="font-mono font-medium text-gray-800">{admsHealth.distinctSerials.join(', ')}</span>
                    </p>
                  )}
                  {admsHealth.latest ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
                      <div className="font-semibold text-slate-900 mb-1">Most recently stored ADMS punch</div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        <div>
                          <span className="text-slate-500">Punch time (stored):</span>{' '}
                          {new Date(admsHealth.latest.punchTime).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </div>
                        <div>
                          <span className="text-slate-500">Saved to DB:</span>{' '}
                          {new Date(admsHealth.latest.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </div>
                        <div>
                          <span className="text-slate-500">User / type:</span>{' '}
                          <span className="font-mono">{admsHealth.latest.deviceUserId}</span> · {admsHealth.latest.punchType}
                        </div>
                        <div>
                          <span className="text-slate-500">Staff:</span>{' '}
                          {admsHealth.latest.staffName ?? (admsHealth.latest.staffId ? 'Linked' : 'Unmapped')}
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-500">Source:</span>{' '}
                          <code className="bg-white px-1 rounded border border-slate-200">{admsHealth.latest.source}</code>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 italic">No ADMS punches in this database yet.</p>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── WINDOWS AGENT TAB ── */}
        {activeTab === 'agent' && (
          <div className="space-y-6">
            {/* Windows Agent */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <h2 className="font-semibold text-gray-900">Windows Agent</h2>
                <a
                  href="https://github.com/ellodanem/shift-close/releases/latest"
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold text-sm hover:bg-gray-800"
                >
                  Download installer (placeholder)
                </a>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
                Temporary placeholder link. Replace with the direct release asset URL when ready.
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Install the local agent on an always-on PC on the same LAN as the ZKTeco device. It runs in the system tray
                and keeps the device&apos;s user list aligned with Shift Close by pushing new staff on a schedule. Punches
                normally reach the cloud in real time via <strong>ADMS</strong> on the device; the agent does{' '}
                <strong>not</strong> poll the device for punches on a timer. Use its local dashboard when you need to test
                the device, upload selected punches manually, or copy ADMS settings.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-blue-800 mb-1">Auto staff sync</div>
                  <div className="text-blue-700">Every 5 minutes (default) — pushes staff who have a Device User ID onto the terminal</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-green-800 mb-1">Manual punch upload</div>
                  <div className="text-green-700">
                    On demand at <code className="text-xs bg-green-100 px-1 rounded">localhost:3001</code> — load punches from
                    the device, choose rows, send to Shift Close (e.g. catch-up if ADMS was offline)
                  </div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-purple-800 mb-1">Local dashboard</div>
                  <div className="text-purple-700">
                    Status, device test, push staff now, punch table with names from the device, and ADMS URL reference
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 space-y-2">
                <p>
                  <strong>To build the installer:</strong> From the <code className="bg-amber-100 px-1 rounded">agent</code>{' '}
                  folder (inside this app):{' '}
                  <code className="bg-amber-100 px-1 rounded">npm install &amp;&amp; npm run build</code> — the NSIS{' '}
                  <code>.exe</code> is written under <code className="bg-amber-100 px-1 rounded">agent/</code> plus whatever{' '}
                  <code className="bg-amber-100 px-1 rounded">build.directories.output</code> is in{' '}
                  <code className="bg-amber-100 px-1 rounded">agent/package.json</code>.
                </p>
                <p>
                  <strong>Download button:</strong> Serves the newest <code className="bg-amber-100 px-1 rounded">.exe</code> from
                  that output folder when this server has a local build. On Vercel (or whenever the file is not on disk), set{' '}
                  <code className="bg-amber-100 px-1 rounded">WINDOWS_AGENT_INSTALLER_URL</code> to a direct link (for example a
                  GitHub Release asset); the button then redirects there instead.
                </p>
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

        {/* ── INSTRUCTIONS TAB ── */}
        {activeTab === 'instructions' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setOpenInstructionId((prev) =>
                    prev === 'add-fingerprint-existing-user' ? '' : 'add-fingerprint-existing-user'
                  )
                }
                className="w-full px-5 py-4 text-left flex items-center justify-between hover:bg-gray-50"
                aria-expanded={openInstructionId === 'add-fingerprint-existing-user'}
              >
                <span className="font-semibold text-gray-900">Add Fingerprint (Existing User Only)</span>
                <span className="text-sm font-semibold text-gray-500">
                  {openInstructionId === 'add-fingerprint-existing-user' ? 'Hide' : 'Open'}
                </span>
              </button>

              {openInstructionId === 'add-fingerprint-existing-user' && (
                <div className="border-t border-gray-200 p-5 space-y-6">
                  <p className="text-sm text-gray-600">
                    Use this guide for ZKTeco F22 and similar models. Screen names can vary slightly by firmware version.
                  </p>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold mb-2">Important rules</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>This guide is for existing users only.</li>
                      <li>Do not create a new user in this flow.</li>
                      <li>Always test the finger after saving.</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Quick steps</h3>
                    <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
                      <li>Press <strong>Menu</strong> and sign in as Admin.</li>
                      <li>Open <strong>User Mgt</strong>, then <strong>All Users</strong> or <strong>User List</strong>.</li>
                      <li>Select the correct existing employee.</li>
                      <li>
                        Tap <strong>Edit</strong>, then <strong>Fingerprint</strong>, then <strong>Add FP</strong> /{' '}
                        <strong>Enroll FP</strong>.
                      </li>
                      <li>Have the employee place the same finger as prompted until success shows.</li>
                      <li>Tap <strong>OK</strong> / <strong>Save</strong>.</li>
                      <li>Test the same finger to confirm it works.</li>
                    </ol>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Visual walkthrough (placeholders)</h3>
                    <div className="space-y-3 text-sm">
                      <div className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="font-semibold text-gray-900">Screenshot 1: Menu</p>
                        <p className="text-gray-600">Main screen with the Menu button highlighted.</p>
                      </div>
                      <div className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="font-semibold text-gray-900">Screenshot 2: User Management</p>
                        <p className="text-gray-600">Menu screen with User Mgt circled.</p>
                      </div>
                      <div className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="font-semibold text-gray-900">Screenshot 3: Select Existing User</p>
                        <p className="text-gray-600">User list with the correct employee row highlighted.</p>
                      </div>
                      <div className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="font-semibold text-gray-900">Screenshot 4: Fingerprint Screen</p>
                        <p className="text-gray-600">Edit screen with Fingerprint then Add FP / Enroll FP selected.</p>
                      </div>
                      <div className="rounded border border-gray-200 bg-gray-50 p-3">
                        <p className="font-semibold text-gray-900">Screenshot 5: Scan Prompt</p>
                        <p className="text-gray-600">Place finger prompt or success confirmation screen.</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Common mistakes</h3>
                    <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                      <li>Selecting the wrong employee.</li>
                      <li>Creating a new user instead of editing the existing user.</li>
                      <li>Skipping the final finger test after save.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenInstructionId((prev) => (prev === 'new-user-enrollment' ? '' : 'new-user-enrollment'))}
                className="w-full px-5 py-4 text-left flex items-center justify-between hover:bg-gray-50"
                aria-expanded={openInstructionId === 'new-user-enrollment'}
              >
                <span className="font-semibold text-gray-900">New User Enrollment (Separate Guide)</span>
                <span className="text-sm font-semibold text-gray-500">
                  {openInstructionId === 'new-user-enrollment' ? 'Hide' : 'Open'}
                </span>
              </button>

              {openInstructionId === 'new-user-enrollment' && (
                <div className="border-t border-gray-200 p-5">
                  <p className="text-sm text-gray-600">
                    Add this guide separately. The fingerprint steps in this page are for existing users only.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
