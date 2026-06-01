'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import { useAuth } from '@/app/components/AuthContext'
import { IconCallOut, useDropdownFixedPosition } from '@/app/components/IconDropdown'
import {
  countOffDaysForStaffInWeek,
  ROSTER_MIN_OFF_DAYS_PER_WEEK_DEFAULT,
  staffIdsBelowMinOffDays
} from '@/lib/roster-settings'
import CallOutCalledAtFields from '@/app/components/CallOutCalledAtFields'
import {
  buildCallOutTooltip,
  combineCalledAtParts,
  defaultCalledAtPartsForWorkDate,
  defaultCalledAtPartsNow,
  EMPTY_CALLED_AT_PARTS,
  snapCalledAtTimeToSelect,
  splitCalledAtToParts,
  type CalledAtParts
} from '@/lib/call-outs'
import {
  activeCountStaffIds,
  displayStaffForWeek,
  ghostShiftCountsByDay as computeGhostShiftCountsByDay,
  ghostStaffInWeek,
  isGhostRosterStaff,
  isRosterDayLocked,
  mergeEntriesRespectingDayLock,
  previousWeekReferenceDate,
  previousWeekTooltip,
  rosterCountDayTooltip,
  rosterCountGhostFootnote,
  rosterEntryKey,
  weekStartMondayFromDate,
  buildCountByDayAndShift,
  GHOST_ROSTER_STAFF_TITLE,
  rosterCellLabel
} from '@/lib/roster-week-client'

interface Staff {
  id: string
  name: string
  firstName?: string
  status: string
  role: string
  /** YYYY-MM-DD — roster rows only from this date onward */
  startDate?: string | null
  vacationStart?: string | null
  vacationEnd?: string | null
  mobileNumber?: string | null
  /** YYYY-MM-DD — used to show a birthday marker on the roster when the cell date matches month/day */
  dateOfBirth?: string | null
}

function isBirthdayOnDate(staff: Staff, isoDate: string): boolean {
  const dob = staff.dateOfBirth?.trim()
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false
  const [, dm, dd] = dob.split('-')
  const [, tm, td] = isoDate.split('-')
  if (!dm || !dd || !tm || !td) return false
  return dm === tm && dd === td
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

interface StaffDayOffRequest {
  id: string
  staffId: string
  date: string
  reason?: string | null
  status: string
}

interface StaffSickLeave {
  id: string
  staffId: string
  startDate: string
  endDate: string
  reason?: string | null
  status: string
}

interface StaffCallOut {
  id: string
  staffId: string
  date: string
  calledAt: string
  notes: string
  recordedByUserId?: string | null
  recordedByLabel?: string | null
}

/** Read-only indicator when a call out exists; use toolbar + Call outs page to log. */
function CallOutMarker({
  callOut,
  sickOverlap
}: {
  callOut?: StaffCallOut
  sickOverlap: boolean
}) {
  if (!callOut) return null
  const title = buildCallOutTooltip({
    calledAt: callOut.calledAt,
    notes: callOut.notes,
    recordedByLabel: callOut.recordedByLabel,
    sickLeaveOverlap: sickOverlap
  })
  return (
    <span
      className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-full bg-amber-600 text-white shadow-sm ring-1 ring-amber-900/25 select-none"
      title={title}
      role="img"
      aria-label="Call out"
    >
      <IconCallOut size={9} />
    </span>
  )
}

interface ParsedDayOffRequest {
  type: 'off' | 'shift'
  shiftTemplateId: string | null
  reason: string
}

function encodeShiftRequestReason(shiftTemplateId: string, reason: string): string {
  const trimmed = reason.trim()
  return trimmed
    ? `SHIFT_REQUEST:${shiftTemplateId}|${trimmed}`
    : `SHIFT_REQUEST:${shiftTemplateId}`
}

function parseDayOffRequestReason(reason: string | null | undefined): ParsedDayOffRequest {
  const raw = (reason || '').trim()
  if (!raw.startsWith('SHIFT_REQUEST:')) {
    return { type: 'off', shiftTemplateId: null, reason: raw }
  }
  const payload = raw.slice('SHIFT_REQUEST:'.length)
  const [templateId, ...rest] = payload.split('|')
  return {
    type: templateId ? 'shift' : 'off',
    shiftTemplateId: templateId || null,
    reason: rest.join('|').trim()
  }
}

interface PublicHolidayRow {
  id: string
  date: string
  name: string
  stationClosed: boolean
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

/** Digits only for wa.me (include country code, e.g. 12425551234) */
function mobileDigits(phone: string): string {
  return (phone || '').replace(/\D/g, '')
}

export default function RosterPage() {
  const router = useRouter()
  const { canEditRoster, canLogCallOut } = useAuth()
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [weekStart, setWeekStart] = useState<string>(() =>
    formatInputDate(getMonday(new Date()))
  )
  const [entries, setEntries] = useState<RosterEntry[]>([])
  const [previousWeekEntries, setPreviousWeekEntries] = useState<RosterEntry[]>([])
  const serverEntriesRef = useRef<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [smsSubmenuOpen, setSmsSubmenuOpen] = useState(false)
  const shareTriggerRef = useRef<HTMLButtonElement>(null)
  const shareMenuRef = useRef<HTMLDivElement>(null)
  const shareMenuPos = useDropdownFixedPosition(shareMenuOpen, 'left', shareTriggerRef)
  const [shareMenuLeft, setShareMenuLeft] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!shareMenuOpen || shareMenuPos?.left == null || !shareTriggerRef.current) {
      setShareMenuLeft(null)
      return
    }
    const run = () => {
      const trigger = shareTriggerRef.current!.getBoundingClientRect()
      const menuW = shareMenuRef.current?.offsetWidth ?? 0
      const pad = 8
      let left = trigger.left
      if (menuW > 0 && left + menuW > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - menuW - pad)
      }
      setShareMenuLeft(left)
    }
    run()
    window.addEventListener('resize', run)
    window.addEventListener('scroll', run, true)
    return () => {
      window.removeEventListener('resize', run)
      window.removeEventListener('scroll', run, true)
    }
  }, [shareMenuOpen, shareMenuPos])
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false)
  const [fillWeekPopover, setFillWeekPopover] = useState<{ staffId: string; shiftId: string } | null>(null)
  const [showDayOffModal, setShowDayOffModal] = useState(false)
  const [dayOffStaffId, setDayOffStaffId] = useState('')
  const [dayOffDate, setDayOffDate] = useState('')
  const [dayOffRequestType, setDayOffRequestType] = useState<'off' | 'shift'>('off')
  const [dayOffShiftTemplateId, setDayOffShiftTemplateId] = useState('')
  const [dayOffReason, setDayOffReason] = useState('')
  const [savingDayOff, setSavingDayOff] = useState(false)
  const [dayOffSuccess, setDayOffSuccess] = useState(false)
  const [showSickLeaveModal, setShowSickLeaveModal] = useState(false)
  const [sickLeaveStaffId, setSickLeaveStaffId] = useState('')
  const [sickLeaveStartDate, setSickLeaveStartDate] = useState('')
  const [sickLeaveEndDate, setSickLeaveEndDate] = useState('')
  const [sickLeaveReason, setSickLeaveReason] = useState('')
  const [savingSickLeave, setSavingSickLeave] = useState(false)
  const [sickLeaveSuccess, setSickLeaveSuccess] = useState(false)
  const [showVacationModal, setShowVacationModal] = useState(false)
  const [vacationStaffId, setVacationStaffId] = useState('')
  const [vacationStartDate, setVacationStartDate] = useState('')
  const [vacationEndDate, setVacationEndDate] = useState('')
  const [savingVacation, setSavingVacation] = useState(false)
  const [vacationSuccess, setVacationSuccess] = useState(false)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [whatsappStaffWithMobile, setWhatsappStaffWithMobile] = useState<Staff[]>([])
  const [whatsappStaffWithoutMobile, setWhatsappStaffWithoutMobile] = useState<Staff[]>([])
  const [whatsappStep, setWhatsappStep] = useState<'warning' | 'confirm'>('warning')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageRef = useRef<HTMLDivElement | null>(null)
  const rosterBannerRef = useRef<HTMLDivElement | null>(null)
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const topScrollContentRef = useRef<HTMLDivElement | null>(null)
  const headerScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  /** Height of the week banner — sticky table header sits directly below it in <main>. */
  const [rosterStickyOffsets, setRosterStickyOffsets] = useState({ banner: 0 })
  const [publicHolidays, setPublicHolidays] = useState<PublicHolidayRow[]>([])
  const [dayOffRequests, setDayOffRequests] = useState<StaffDayOffRequest[]>([])
  const [sickLeaves, setSickLeaves] = useState<StaffSickLeave[]>([])
  const [callOuts, setCallOuts] = useState<StaffCallOut[]>([])
  const [showCallOutModal, setShowCallOutModal] = useState(false)
  const [callOutStaffId, setCallOutStaffId] = useState('')
  const [callOutDate, setCallOutDate] = useState('')
  const [callOutNotes, setCallOutNotes] = useState('')
  const [callOutCalledAtParts, setCallOutCalledAtParts] = useState<CalledAtParts>(EMPTY_CALLED_AT_PARTS)
  const [savingCallOut, setSavingCallOut] = useState(false)
  const [minOffDaysPerWeek, setMinOffDaysPerWeek] = useState(ROSTER_MIN_OFF_DAYS_PER_WEEK_DEFAULT)

  const weekDates = useMemo(
    () => dayLabels.map((_, idx) => addDays(weekStart, idx)),
    [weekStart]
  )

  const rosterTableColGroup = useMemo(
    () => (
      <colgroup>
        <col className="w-[7.5rem]" />
        {weekDates.map((date) => (
          <col key={date} />
        ))}
      </colgroup>
    ),
    [weekDates]
  )

  // Week banner colour: past/locked = grey, current (editable Mon–Sat) = light green, future = light blue
  const weekBannerStyle = useMemo(() => {
    const today = formatInputDate(new Date())
    const weekSunday = addDays(weekStart, 6)
    const thisWeekMonday = formatInputDate(getMonday(new Date()))
    if (today >= weekSunday) return { bg: 'bg-gray-200', text: 'text-gray-700' } // locked from Sunday
    if (weekStart > thisWeekMonday) return { bg: 'bg-sky-100', text: 'text-sky-900' }
    return { bg: 'bg-green-100', text: 'text-green-900' }
  }, [weekStart])

  // Weeks lock on Sunday: once Sunday of that week arrives the roster is read-only
  const isPastWeek = useMemo(() => {
    const today = formatInputDate(new Date())
    const weekSunday = addDays(weekStart, 6)
    return today >= weekSunday
  }, [weekStart])

  /** Past calendar week OR role cannot edit roster (supervisor = view-only). */
  const rosterLockedEdit = isPastWeek || !canEditRoster

  const isViewingCurrentWeek =
    weekStart === formatInputDate(getMonday(new Date()))

  const todayIso = useMemo(() => formatInputDate(new Date()), [])

  const isCellLocked = (date: string): boolean =>
    rosterLockedEdit || isRosterDayLocked(date, weekStart, todayIso)

  const lockedDaysInWeek = useMemo(
    () => weekDates.filter((date) => isRosterDayLocked(date, weekStart, todayIso)),
    [weekDates, weekStart, todayIso]
  )

  const templateNameById = useMemo(
    () => new Map(templates.map((t) => [t.id, t.name])),
    [templates]
  )

  const previousWeekEntryByKey = useMemo(() => {
    const map = new Map<string, RosterEntry>()
    for (const entry of previousWeekEntries) {
      map.set(rosterEntryKey(entry.staffId, entry.date), entry)
    }
    return map
  }, [previousWeekEntries])

  const getLastWeekTooltip = (staffId: string, date: string): string => {
    const prevDate = previousWeekReferenceDate(date)
    const prev = previousWeekEntryByKey.get(rosterEntryKey(staffId, prevDate))
    return previousWeekTooltip(date, prev, templateNameById)
  }

  const displayStaff = useMemo(
    () => displayStaffForWeek(allStaff, weekStart, entries),
    [allStaff, weekStart, entries]
  )

  const countStaffIds = useMemo(() => activeCountStaffIds(displayStaff), [displayStaff])

  const ghostStaff = useMemo(() => ghostStaffInWeek(displayStaff), [displayStaff])

  const ghostStaffIds = useMemo(() => new Set(ghostStaff.map((s) => s.id)), [ghostStaff])

  const ghostShiftCountByDay = useMemo(
    () =>
      computeGhostShiftCountsByDay({
        weekDates,
        entries,
        ghostStaffIds
      }),
    [weekDates, entries, ghostStaffIds]
  )

  const countGhostFootnote = useMemo(
    () => rosterCountGhostFootnote(ghostStaff.length),
    [ghostStaff.length]
  )

  // Load staff, templates, and settings in one request
  useEffect(() => {
    async function loadStatic() {
      try {
        const res = await fetch('/api/roster/static-bootstrap')
        if (!res.ok) {
          setError('Failed to load staff or shift presets.')
          return
        }
        const data = await res.json()
        if (Array.isArray(data.staff)) {
          setAllStaff(data.staff as Staff[])
        }
        if (Array.isArray(data.templates)) {
          setTemplates(data.templates as ShiftTemplate[])
        }
        const n = Number(data.minOffDaysPerWeek)
        if (Number.isFinite(n)) setMinOffDaysPerWeek(n)
      } catch (err) {
        console.error('Error loading roster static data', err)
        setError('Failed to load staff or shift presets.')
      }
    }
    loadStatic()
  }, [])

  // Load roster entries whenever weekStart changes
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    async function loadWeek() {
      setLoading(true)
      setError(null)
      const weekEnd = addDays(weekStart, 6)
      try {
        const res = await fetch(
          `/api/roster/week-bundle?weekStart=${weekStart}&weekEnd=${weekEnd}`
        )
        if (!res.ok) {
          console.error('Failed to fetch roster week bundle', res.status)
          setError('Failed to load roster for this week.')
          return
        }
        const data = await res.json()
        const loadedEntries: RosterEntry[] = data.entries || []
        setEntries(loadedEntries)
        serverEntriesRef.current = loadedEntries
        setPreviousWeekEntries(
          Array.isArray(data.previousWeekEntries)
            ? (data.previousWeekEntries as RosterEntry[])
            : []
        )
        setDayOffRequests(
          Array.isArray(data.dayOffRequests) ? (data.dayOffRequests as StaffDayOffRequest[]) : []
        )
        setSickLeaves(Array.isArray(data.sickLeaves) ? (data.sickLeaves as StaffSickLeave[]) : [])
        const rawCallOuts = Array.isArray(data.callOuts) ? data.callOuts : []
        setCallOuts(
          rawCallOuts.map(
            (c: {
              id: string
              staffId: string
              date: string
              calledAt: string
              notes: string
              recordedByUserId?: string | null
              recordedBy?: { username: string; firstName?: string | null; lastName?: string | null } | null
            }) => ({
              id: c.id,
              staffId: c.staffId,
              date: c.date,
              calledAt: typeof c.calledAt === 'string' ? c.calledAt : new Date(c.calledAt).toISOString(),
              notes: c.notes ?? '',
              recordedByUserId: c.recordedByUserId,
              recordedByLabel: c.recordedBy
                ? [c.recordedBy.firstName, c.recordedBy.lastName].filter(Boolean).join(' ').trim() ||
                  c.recordedBy.username
                : null
            })
          )
        )
        setPublicHolidays(
          Array.isArray(data.publicHolidays) ? (data.publicHolidays as PublicHolidayRow[]) : []
        )
      } catch (err) {
        console.error('Error loading roster week', err)
        setError('Failed to load roster for this week.')
      } finally {
        setLoading(false)
      }
    }
    loadWeek()
  }, [weekStart])

  useEffect(() => {
    if (!copyConfirmOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCopyConfirmOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copyConfirmOpen])

  useEffect(() => {
    if (!shareMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShareMenuOpen(false); setSmsSubmenuOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shareMenuOpen])

  const updateRosterStickyOffsets = () => {
    const bannerH = rosterBannerRef.current?.offsetHeight ?? 0
    setRosterStickyOffsets({ banner: bannerH })
  }

  useEffect(() => {
    const banner = rosterBannerRef.current
    if (!banner) return
    const run = () => updateRosterStickyOffsets()
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(run) : null
    resizeObserver?.observe(banner)
    window.addEventListener('resize', run)
    run()
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', run)
    }
  }, [loading, weekStart, rosterLockedEdit, saving, shareMenuOpen, copyConfirmOpen])

  useEffect(() => {
    const topScroller = topScrollRef.current
    const topContent = topScrollContentRef.current
    const headerScroller = headerScrollRef.current
    const tableScroller = tableScrollRef.current
    if (!topScroller || !topContent || !tableScroller) return

    let syncing = false

    const syncWidths = () => {
      // Table is `display:none` below md — skip to avoid bogus measurements and layout thrash
      if (tableScroller.offsetParent === null) {
        topScroller.style.display = 'none'
        updateRosterStickyOffsets()
        return
      }
      const scrollWidth = tableScroller.scrollWidth
      const clientWidth = tableScroller.clientWidth
      topContent.style.width = `${scrollWidth}px`
      topScroller.style.display = scrollWidth > clientWidth ? 'block' : 'none'
      updateRosterStickyOffsets()
    }

    const syncScrollLeft = (source: HTMLDivElement, left: number) => {
      if (syncing) return
      syncing = true
      if (source !== topScroller) topScroller.scrollLeft = left
      if (headerScroller && source !== headerScroller) headerScroller.scrollLeft = left
      if (source !== tableScroller) tableScroller.scrollLeft = left
      syncing = false
    }

    const onTopScroll = () => syncScrollLeft(topScroller, topScroller.scrollLeft)
    const onHeaderScroll = () => {
      if (!headerScroller) return
      syncScrollLeft(headerScroller, headerScroller.scrollLeft)
    }
    const onTableScroll = () => syncScrollLeft(tableScroller, tableScroller.scrollLeft)

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncWidths) : null
    resizeObserver?.observe(tableScroller)
    if (tableScroller.firstElementChild) resizeObserver?.observe(tableScroller.firstElementChild)

    topScroller.addEventListener('scroll', onTopScroll, { passive: true })
    headerScroller?.addEventListener('scroll', onHeaderScroll, { passive: true })
    tableScroller.addEventListener('scroll', onTableScroll, { passive: true })
    window.addEventListener('resize', syncWidths)
    syncWidths()

    return () => {
      topScroller.removeEventListener('scroll', onTopScroll)
      headerScroller?.removeEventListener('scroll', onHeaderScroll)
      tableScroller.removeEventListener('scroll', onTableScroll)
      window.removeEventListener('resize', syncWidths)
      resizeObserver?.disconnect()
    }
  }, [loading, entries.length, displayStaff.length, templates.length, weekStart])

  const getEntryFor = (staffId: string, date: string): RosterEntry | undefined =>
    entries.find((e) => e.staffId === staffId && e.date === date)

  const getTemplateForEntry = (entry?: RosterEntry) =>
    entry?.shiftTemplateId
      ? templates.find((t) => t.id === entry.shiftTemplateId) || null
      : null

  const isOnSickLeave = (staffId: string, date: string): boolean =>
    sickLeaves.some(
      (leave) =>
        leave.staffId === staffId &&
        leave.status !== 'denied' &&
        leave.startDate <= date &&
        leave.endDate >= date
    )

  const getDayOffRequestFor = (staffId: string, date: string): StaffDayOffRequest | undefined =>
    dayOffRequests.find(
      (request) => request.staffId === staffId && request.date === date && request.status !== 'denied'
    )

  const getCallOutFor = (staffId: string, date: string): StaffCallOut | undefined =>
    callOuts.find((c) => c.staffId === staffId && c.date === date)

  const syncCallOutFormForSelection = (staffId: string, date: string) => {
    if (!staffId || !date) {
      setCallOutNotes('')
      setCallOutCalledAtParts(defaultCalledAtPartsNow())
      return
    }
    const existing = getCallOutFor(staffId, date)
    setCallOutNotes(existing?.notes ?? '')
    if (existing) {
      const parts = splitCalledAtToParts(existing.calledAt)
      setCallOutCalledAtParts({ date: parts.date, time: snapCalledAtTimeToSelect(parts.time) })
    } else {
      setCallOutCalledAtParts(defaultCalledAtPartsForWorkDate(date))
    }
  }

  const openCallOutModal = (staff?: Staff, date?: string) => {
    const workDate = date ?? formatInputDate(new Date())
    const staffId = staff?.id ?? ''
    setCallOutStaffId(staffId)
    setCallOutDate(workDate)
    syncCallOutFormForSelection(staffId, workDate)
    setShowCallOutModal(true)
  }

  const handleSaveCallOut = async () => {
    if (!callOutStaffId || !callOutDate) return
    setSavingCallOut(true)
    try {
      const body: { date: string; notes: string; calledAt?: string } = {
        date: callOutDate,
        notes: callOutNotes
      }
      const calledAtIso = combineCalledAtParts(callOutCalledAtParts)
      if (calledAtIso) body.calledAt = calledAtIso
      const res = await fetch(`/api/staff/${callOutStaffId}/call-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save')
      }
      const saved = await res.json()
      setCallOuts((prev) => {
        const rest = prev.filter(
          (c) => !(c.staffId === saved.staffId && c.date === saved.date)
        )
        return [...rest, saved as StaffCallOut]
      })
      setShowCallOutModal(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save call out')
    } finally {
      setSavingCallOut(false)
    }
  }

  const handleDeleteCallOut = async () => {
    if (!callOutStaffId || !callOutDate) return
    const existing = getCallOutFor(callOutStaffId, callOutDate)
    if (!existing) {
      setShowCallOutModal(false)
      return
    }
    if (!confirm('Remove this call out?')) return
    setSavingCallOut(true)
    try {
      const res = await fetch(`/api/call-outs/${existing.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setCallOuts((prev) => prev.filter((c) => c.id !== existing.id))
      setShowCallOutModal(false)
    } catch {
      alert('Failed to delete call out')
    } finally {
      setSavingCallOut(false)
    }
  }

  const stationClosedDates = useMemo(
    () => new Set(publicHolidays.filter((h) => h.stationClosed).map((h) => h.date)),
    [publicHolidays]
  )

  const staffBelowMinOff = useMemo(
    () =>
      staffIdsBelowMinOffDays({
        displayStaff: displayStaff.filter((s) => !isGhostRosterStaff(s)),
        weekDates,
        entries,
        stationClosedDates,
        minOffDays: minOffDaysPerWeek,
        isOnSickLeave
      }),
    [displayStaff, weekDates, entries, stationClosedDates, minOffDaysPerWeek, sickLeaves]
  )

  const staffOffDaysWarningTitle = (staff: Staff): string | undefined => {
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

  const shareCellBlock = (staff: Staff, date: string): string | null => {
    if (isGhostRosterStaff(staff)) return 'Inactive'
    if (isOnVacation(staff, date)) return 'Vacation'
    if (isOnSickLeave(staff.id, date)) return 'Sick leave'
    if (stationClosedDates.has(date)) return 'Station closed'
    return null
  }

  const shareCellLabel = (staff: Staff, date: string) => {
    const entry = getEntryFor(staff.id, date)
    return rosterCellLabel({
      entry,
      block: shareCellBlock(staff, date),
      templateName: getTemplateForEntry(entry)?.name ?? null
    })
  }

  // Per-day, per-shift running counts (updates as assignments change)
  const countByDayAndShift = useMemo(
    () =>
      buildCountByDayAndShift({
        weekDates,
        entries,
        displayStaffIds: countStaffIds,
        templates
      }),
    [entries, weekDates, countStaffIds, templates]
  )

  const handleMoveStaff = async (index: number, direction: 'up' | 'down') => {
    if (rosterLockedEdit) return
    const staffAtIndex = displayStaff[index]
    if (!staffAtIndex || isGhostRosterStaff(staffAtIndex)) return
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= displayStaff.length) return
    if (isGhostRosterStaff(displayStaff[newIndex])) return
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
    if (isCellLocked(date)) return
    const staff = allStaff.find((s) => s.id === staffId)
    if (staff && isGhostRosterStaff(staff)) return
    if (staff && isOnVacation(staff, date)) return
    if (isOnSickLeave(staffId, date)) return
    if (publicHolidays.some((h) => h.date === date && h.stationClosed)) return
    setEntries((prev) => {
      const existing = prev.find((e) => e.staffId === staffId && e.date === date)
      let next: RosterEntry[]

      if (existing) {
        // Update existing: set shiftTemplateId (null = Off)
        next = prev.map((e) => (e === existing ? { ...e, shiftTemplateId } : e))
      } else {
        // Add new entry (including Off with shiftTemplateId: null so dashboard "Who's off" works)
        next = [
          ...prev,
          {
            staffId,
            date,
            shiftTemplateId,
            position: null,
            notes: ''
          }
        ]
      }

      // Auto-save roster shortly after any change, using the updated snapshot
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
        void handleSave(next)
      }, 300)

      return next
    })
  }

  const fillWeekForStaff = (staffId: string, shiftTemplateId: string | null) => {
    if (rosterLockedEdit) return
    const staff = allStaff.find((s) => s.id === staffId)
    if (staff && isGhostRosterStaff(staff)) return
    setEntries((prev) => {
      let next = [...prev]
      for (const date of weekDates) {
        if (isCellLocked(date)) continue
        if (staff && isOnVacation(staff, date)) continue
        if (isOnSickLeave(staffId, date)) continue
        if (publicHolidays.some((h) => h.date === date && h.stationClosed)) continue
        const existing = next.find((e) => e.staffId === staffId && e.date === date)
        if (existing) {
          next = next.map((e) => (e === existing ? { ...e, shiftTemplateId } : e))
        } else {
          next = [...next, { staffId, date, shiftTemplateId, position: null, notes: '' }]
        }
      }
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => { void handleSave(next) }, 300)
      return next
    })
    setFillWeekPopover(null)
  }

  const handleChangeWeek = (direction: -1 | 1) => {
    setFillWeekPopover(null)
    setWeekStart((current) => addDays(current, direction * 7))
  }

  const handleWeekStartPickerChange = (picked: string) => {
    if (!picked) return
    setFillWeekPopover(null)
    setWeekStart(weekStartMondayFromDate(picked))
  }

  const handleSave = async (entriesToPersist?: RosterEntry[]) => {
    if (!canEditRoster) return
    if (rosterLockedEdit) return
    const today = formatInputDate(new Date())
    const weekSunday = addDays(weekStart, 6)
    if (today >= weekSunday) return // Weeks lock on Sunday
    setSaving(true)
    setError(null)
    try {
      const snapshot = entriesToPersist ?? entries
      // Build full roster (displayStaff × weekDates) so "Off" days are persisted for dashboard "Who's off"
      const entriesToSave = mergeEntriesRespectingDayLock({
        weekStart,
        incoming: displayStaff.flatMap((s) =>
          weekDates.map((date) => {
            const entry = snapshot.find((e) => e.staffId === s.id && e.date === date)
            const stationClosedDay = publicHolidays.some((h) => h.date === date && h.stationClosed)
            return {
              staffId: s.id,
              date,
              shiftTemplateId: stationClosedDay ? null : entry?.shiftTemplateId ?? null,
              position: entry?.position ?? null,
              notes: entry?.notes ?? ''
            }
          })
        ),
        serverSnapshot: serverEntriesRef.current,
        today: todayIso
      })
      const res = await fetch('/api/roster/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          status: 'draft',
          entries: entriesToSave
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save roster')
      }
      serverEntriesRef.current = entriesToSave.map((e) => ({
        staffId: e.staffId,
        date: e.date,
        shiftTemplateId: e.shiftTemplateId,
        position: e.position,
        notes: e.notes
      }))
    } catch (err) {
      console.error('Error saving roster', err)
      setError(err instanceof Error ? err.message : 'Failed to save roster')
    } finally {
      setSaving(false)
    }
  }

  const buildRosterText = () => {
    if (displayStaff.length === 0) return 'No staff in this roster.'

    const lines: string[] = []
    lines.push(`Roster for week starting ${weekStart} (through ${weekDates[6]})`)
    lines.push('')
    lines.push('Format: Staff – Mon..Sun (per-day shift name or Off)')
    lines.push('------------------------------------------------------')

    displayStaff.filter((s) => !isGhostRosterStaff(s)).forEach((s) => {
      const dayStrings = weekDates.map((date) => shareCellLabel(s, date))
      const displayName = s.firstName?.trim() || s.name
      lines.push(`${displayName}: ${dayStrings.join(' | ')}`)
    })

    return lines.join('\n')
  }

  const handleCopyPreviousWeek = async () => {
    if (rosterLockedEdit) return
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
      const activeStaffIds = new Set(
        allStaff.filter((s) => s.status === 'active').map((s) => s.id)
      )
      const prevWeekDates = dayLabels.map((_, i) => addDays(prevWeekStart, i))
      const newEntries = prevEntries
        .filter((e) => activeStaffIds.has(e.staffId))
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
      const newEntriesStripped = newEntries.map((e) => {
        const closed = publicHolidays.some((h) => h.date === e.date && h.stationClosed)
        const staff = allStaff.find((s) => s.id === e.staffId)
        const blockedByLeave =
          (staff ? isOnVacation(staff, e.date) : false) || isOnSickLeave(e.staffId, e.date)
        return (closed || blockedByLeave) ? { ...e, shiftTemplateId: null } : e
      })
      const copiedByKey = new Map(
        newEntriesStripped.map((e) => [rosterEntryKey(e.staffId, e.date), e])
      )
      const mergedAfterCopy = displayStaff.flatMap((s) =>
        weekDates.map((date) => {
          const key = rosterEntryKey(s.id, date)
          if (isRosterDayLocked(date, weekStart, todayIso)) {
            const kept =
              entries.find((e) => e.staffId === s.id && e.date === date) ??
              serverEntriesRef.current.find((e) => e.staffId === s.id && e.date === date)
            if (kept) {
              return {
                staffId: s.id,
                date,
                shiftTemplateId: kept.shiftTemplateId ?? null,
                position: kept.position ?? null,
                notes: kept.notes ?? ''
              }
            }
            return {
              staffId: s.id,
              date,
              shiftTemplateId: null,
              position: null,
              notes: ''
            }
          }
          const copied = copiedByKey.get(key)
          if (copied) return copied
          const existing = entries.find((e) => e.staffId === s.id && e.date === date)
          return {
            staffId: s.id,
            date,
            shiftTemplateId: existing?.shiftTemplateId ?? null,
            position: existing?.position ?? null,
            notes: existing?.notes ?? ''
          }
        })
      )
      const saveRes = await fetch('/api/roster/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          status: 'draft',
          entries: mergedAfterCopy
        })
      })
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save roster')
      }
      setEntries(
        mergedAfterCopy.map((e) => ({
          ...e,
          rosterWeekId: undefined,
          id: undefined
        }))
      )
      serverEntriesRef.current = mergedAfterCopy
      const copiedCount = newEntriesStripped.filter(
        (e) => !isRosterDayLocked(e.date, weekStart, todayIso)
      ).length
      alert(`Copied ${copiedCount} shift(s) from previous week.`)
    } catch (err) {
      console.error('Error copying previous week', err)
      setError(err instanceof Error ? err.message : 'Failed to copy previous week')
    } finally {
      setLoading(false)
    }
  }

  const handleClearWeek = async () => {
    if (rosterLockedEdit) return
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
      serverEntriesRef.current = []
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

  const openWhatsAppDirectModal = () => {
    setShareMenuOpen(false)
    if (entries.length === 0) {
      alert('There are no shifts saved for this week yet. Save the roster first.')
      return
    }
    const withMobile = displayStaff.filter(
      (s) => !isGhostRosterStaff(s) && s.mobileNumber && mobileDigits(s.mobileNumber!)
    )
    const withoutMobile = displayStaff.filter(
      (s) => !isGhostRosterStaff(s) && (!s.mobileNumber || !mobileDigits(s.mobileNumber!))
    )
    setWhatsappStaffWithMobile(withMobile)
    setWhatsappStaffWithoutMobile(withoutMobile)
    setWhatsappStep(withoutMobile.length > 0 ? 'warning' : 'confirm')
    setShowWhatsAppModal(true)
  }

  const handleWhatsAppDirectSend = async () => {
    if (whatsappStaffWithMobile.length === 0) {
      alert('No staff have mobile numbers. Add them in Staff settings.')
      return
    }
    setSharing(true)
    try {
      const dataUrl = await generateRosterImage()
      const toList = whatsappStaffWithMobile
        .map((s) => mobileDigits(s.mobileNumber!))
        .filter(Boolean)
      const res = await fetch('/api/roster/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toList,
          imageBase64: dataUrl,
          weekStart
        })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to send')
      setShowWhatsAppModal(false)
      const msg = result.message || `Roster sent to ${result.sent ?? whatsappStaffWithMobile.length} staff.`
      if (result.errors?.length) {
        alert(`${msg}\n\nFailed: ${result.errors.join('\n')}`)
      } else {
        alert(msg)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send roster via WhatsApp')
    } finally {
      setSharing(false)
    }
  }

  const handleWhatsAppTextShare = () => {
    if (entries.length === 0) {
      alert('There are no shifts saved for this week yet. Save the roster first, then share.')
      return
    }
    const text = buildRosterText()
    const encoded = encodeURIComponent(text)
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (isMobileDevice()) {
          window.open(`https://wa.me?text=${encoded}`, '_blank')
        } else {
          window.open('https://web.whatsapp.com', '_blank')
          alert('Roster text copied. Paste into WhatsApp Web (Ctrl+V).')
        }
      }).catch(() => {
        window.open(`https://wa.me?text=${encoded}`, '_blank')
      })
    } else {
      window.open(`https://wa.me?text=${encoded}`, '_blank')
    }
  }

  // Open wa.me to send roster text to a staff member's mobile
  const handleSendToStaff = (staff: Staff) => {
    const num = staff.mobileNumber && mobileDigits(staff.mobileNumber)
    if (!num) return
    if (entries.length === 0) {
      alert('There are no shifts saved for this week yet. Save the roster first.')
      return
    }
    const text = buildRosterText()
    const url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    setShareMenuOpen(false)
  }

  // Open sms: link to send roster text to a staff member's mobile
  const handleSendSmsToStaff = (staff: Staff) => {
    const num = staff.mobileNumber && mobileDigits(staff.mobileNumber)
    if (!num) return
    if (entries.length === 0) {
      alert('There are no shifts saved for this week yet. Save the roster first.')
      return
    }
    const text = buildRosterText()
    const url = `sms:${num}?body=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    setSmsSubmenuOpen(false)
    setShareMenuOpen(false)
  }

  const handlePrintRoster = async () => {
    if (entries.length === 0) {
      alert('There are no shifts saved for this week yet. Save the roster first.')
      return
    }
    setShareMenuOpen(false)
    try {
      setSharing(true)
      const dataUrl = await generateRosterImage()
      const printWin = window.open('', '_blank')
      if (!printWin) {
        alert('Please allow pop-ups to print the roster.')
        return
      }
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
          <head><title>Roster Print</title></head>
          <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;">
            <img src="${dataUrl}" alt="Roster" style="max-width:100%;height:auto;" />
          </body>
        </html>
      `)
      printWin.document.close()
      printWin.focus()
      setTimeout(() => {
        printWin.print()
        printWin.close()
      }, 250)
    } catch (err) {
      console.error('Error printing roster', err)
      alert('Failed to generate roster image for printing')
    } finally {
      setSharing(false)
    }
  }

  const staffWithMobile = useMemo(
    () =>
      displayStaff.filter(
        (s) => !isGhostRosterStaff(s) && s.mobileNumber && mobileDigits(s.mobileNumber!)
      ),
    [displayStaff]
  )

  const handleAddDayOff = async () => {
    if (!dayOffStaffId || !dayOffDate) return
    if (dayOffRequestType === 'shift' && !dayOffShiftTemplateId) {
      alert('Select a requested shift.')
      return
    }
    setSavingDayOff(true)
    try {
      const reason =
        dayOffRequestType === 'shift'
          ? encodeShiftRequestReason(dayOffShiftTemplateId, dayOffReason)
          : dayOffReason
      const res = await fetch(`/api/staff/${dayOffStaffId}/day-off`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dayOffDate, reason })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to save day off request')
      }
      setDayOffSuccess(true)
      setDayOffDate('')
      setDayOffRequestType('off')
      setDayOffShiftTemplateId('')
      setDayOffReason('')
      const weekEnd = addDays(weekStart, 6)
      if (dayOffDate >= weekStart && dayOffDate <= weekEnd) {
        const refreshRes = await fetch(`/api/staff/day-off?startDate=${weekStart}&endDate=${weekEnd}`)
        if (refreshRes.ok) {
          const refreshed: StaffDayOffRequest[] = await refreshRes.json()
          setDayOffRequests(refreshed)
        }
      }
      setTimeout(() => setDayOffSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving day off request', err)
      alert(err instanceof Error ? err.message : 'Failed to save day off request')
    } finally {
      setSavingDayOff(false)
    }
  }

  const handleAddSickLeave = async () => {
    if (!sickLeaveStaffId || !sickLeaveStartDate) return
    const end = sickLeaveEndDate || sickLeaveStartDate
    if (end < sickLeaveStartDate) {
      alert('End date must be on or after start date')
      return
    }
    setSavingSickLeave(true)
    try {
      const res = await fetch(`/api/staff/${sickLeaveStaffId}/sick-leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: sickLeaveStartDate,
          endDate: end,
          reason: sickLeaveReason
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save sick leave')
      }
      setSickLeaveSuccess(true)
      setSickLeaveStartDate('')
      setSickLeaveEndDate('')
      setSickLeaveReason('')
      setTimeout(() => setSickLeaveSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving sick leave', err)
      alert(err instanceof Error ? err.message : 'Failed to save sick leave')
    } finally {
      setSavingSickLeave(false)
    }
  }

  const vacationStaff = useMemo(
    () => allStaff.find((s) => s.id === vacationStaffId),
    [allStaff, vacationStaffId]
  )

  const hasExistingVacation = !!(
    vacationStaff?.vacationStart?.trim() && vacationStaff?.vacationEnd?.trim()
  )

  const handleVacationStaffChange = (staffId: string) => {
    setVacationStaffId(staffId)
    const staff = allStaff.find((s) => s.id === staffId)
    if (staff?.vacationStart && staff?.vacationEnd) {
      setVacationStartDate(staff.vacationStart)
      setVacationEndDate(staff.vacationEnd)
    }
  }

  const handleSaveVacation = async () => {
    if (!vacationStaffId || !vacationStartDate.trim() || !vacationEndDate.trim()) return
    if (vacationEndDate < vacationStartDate) {
      alert('End date must be on or after start date')
      return
    }
    setSavingVacation(true)
    try {
      const start = vacationStartDate.trim()
      const end = vacationEndDate.trim()
      const res = await fetch(`/api/staff/${vacationStaffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacationStart: start, vacationEnd: end })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to save vacation')
      }
      setAllStaff((prev) =>
        prev.map((s) =>
          s.id === vacationStaffId ? { ...s, vacationStart: start, vacationEnd: end } : s
        )
      )
      setVacationSuccess(true)
      setTimeout(() => setVacationSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving vacation', err)
      alert(err instanceof Error ? err.message : 'Failed to save vacation')
    } finally {
      setSavingVacation(false)
    }
  }

  const handleClearVacation = async () => {
    if (!vacationStaffId) return
    setSavingVacation(true)
    try {
      const res = await fetch(`/api/staff/${vacationStaffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacationStart: null, vacationEnd: null })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to clear vacation')
      }
      setAllStaff((prev) =>
        prev.map((s) =>
          s.id === vacationStaffId ? { ...s, vacationStart: null, vacationEnd: null } : s
        )
      )
      setVacationStartDate('')
      setVacationEndDate('')
      setVacationSuccess(true)
      setTimeout(() => setVacationSuccess(false), 3000)
    } catch (err) {
      console.error('Error clearing vacation', err)
      alert(err instanceof Error ? err.message : 'Failed to clear vacation')
    } finally {
      setSavingVacation(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start mb-4 md:mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Roster</h1>
            <p className="text-sm text-gray-600 mt-1 hidden sm:block">
              Weekly staff roster using existing Staff as source of truth.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full md:w-auto shrink-0">
            <a
              href="/staff"
              className="px-3 py-2.5 md:py-2 min-h-[44px] md:min-h-0 flex items-center justify-center text-center bg-white border border-gray-300 text-gray-700 rounded font-semibold hover:bg-gray-50 text-sm sm:inline-block"
            >
              Staff
            </a>
            {canLogCallOut ? (
              <button
                type="button"
                onClick={() => openCallOutModal()}
                className="px-3 py-2.5 md:py-2 min-h-[44px] md:min-h-0 bg-teal-600 text-white rounded font-semibold hover:bg-teal-700 text-sm"
              >
                <span className="md:hidden">+ Call</span>
                <span className="hidden md:inline">+ Call out</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setDayOffStaffId(allStaff.find(s => s.status === 'active' && s.role !== 'manager')?.id ?? '')
                setDayOffDate(formatInputDate(new Date()))
                setDayOffRequestType('off')
                setDayOffShiftTemplateId('')
                setDayOffReason('')
                setDayOffSuccess(false)
                setShowDayOffModal(true)
              }}
              className="px-3 py-2.5 md:py-2 min-h-[44px] md:min-h-0 bg-amber-500 text-white rounded font-semibold hover:bg-amber-600 text-sm"
            >
              <span className="md:hidden">+ Day off</span>
              <span className="hidden md:inline">+ Day Off Request</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const today = formatInputDate(new Date())
                setSickLeaveStaffId(allStaff.find(s => s.status === 'active' && s.role !== 'manager')?.id ?? '')
                setSickLeaveStartDate(today)
                setSickLeaveEndDate(today)
                setSickLeaveReason('')
                setSickLeaveSuccess(false)
                setShowSickLeaveModal(true)
              }}
              className="px-3 py-2.5 md:py-2 min-h-[44px] md:min-h-0 bg-rose-500 text-white rounded font-semibold hover:bg-rose-600 text-sm"
            >
              <span className="md:hidden">+ Sick</span>
              <span className="hidden md:inline">+ Sick Leave</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const defaultStaff = allStaff.find((s) => s.status === 'active' && s.role !== 'manager')
                const today = formatInputDate(new Date())
                const staffId = defaultStaff?.id ?? ''
                setVacationStaffId(staffId)
                setVacationStartDate(defaultStaff?.vacationStart || today)
                setVacationEndDate(defaultStaff?.vacationEnd || today)
                setVacationSuccess(false)
                setShowVacationModal(true)
              }}
              className="px-3 py-2.5 md:py-2 min-h-[44px] md:min-h-0 bg-violet-500 text-white rounded font-semibold hover:bg-violet-600 text-sm"
            >
              <span className="md:hidden">+ Vacation</span>
              <span className="hidden md:inline">+ Vacation</span>
            </button>
            <a
              href="/roster/templates"
              className="px-3 py-2.5 md:py-2 min-h-[44px] md:min-h-0 flex items-center justify-center text-center bg-sky-600 text-white rounded font-semibold hover:bg-sky-700 text-sm sm:inline-block col-span-2 sm:col-span-1"
            >
              <span className="md:hidden">Shift presets</span>
              <span className="hidden md:inline">Shift Presets</span>
            </a>
          </div>
        </div>

        {/* Week picker and actions */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleChangeWeek(-1)}
              className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm font-medium"
            >
              <span className="sm:hidden">← Prev week</span>
              <span className="hidden sm:inline">← Previous week</span>
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(formatInputDate(getMonday(new Date())))}
              className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm font-medium"
            >
              This week
            </button>
            <button
              type="button"
              onClick={() => handleChangeWeek(1)}
              className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm font-medium"
            >
              Next week →
            </button>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-2 w-full sm:w-auto">
            <label className="text-xs font-semibold text-gray-500 shrink-0">Week starting</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => handleWeekStartPickerChange(e.target.value)}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 border border-gray-300 rounded text-base sm:text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-visible">
          <div
            ref={rosterBannerRef}
            className={`sticky top-0 z-30 px-3 sm:px-4 py-2 border-b border-gray-200 flex flex-col gap-3 md:flex-row md:justify-between md:items-center shadow-sm ${weekBannerStyle.bg} ${weekBannerStyle.text}`}
          >
            <span className="text-sm font-semibold leading-snug">
              <span className="md:hidden block">
                {formatPrettyDate(weekStart)} – {formatPrettyDate(weekDates[6])}
              </span>
              <span className="hidden md:inline">
                Weekly roster ({formatPrettyDate(weekStart)} – {formatPrettyDate(weekDates[6])})
              </span>
              {isViewingCurrentWeek && !isPastWeek && (
                <span className="mt-1 md:mt-0 md:ml-2 inline-block rounded bg-white/60 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-green-800">
                  This week
                </span>
              )}
              {isPastWeek && (
                <span className="mt-1 md:mt-0 md:ml-2 block md:inline font-normal text-gray-600">
                  Past week (read-only)
                </span>
              )}
            </span>
            <div className="flex flex-wrap items-stretch md:items-center gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={() => setCopyConfirmOpen(true)}
                disabled={loading || sharing || rosterLockedEdit}
                className="flex-1 md:flex-none min-h-[44px] md:min-h-0 px-3 py-2.5 md:py-1.5 border border-amber-600 text-amber-700 rounded text-xs font-semibold hover:bg-amber-50 disabled:opacity-60"
              >
                <span className="md:hidden">Copy prev week</span>
                <span className="hidden md:inline">Copy previous week</span>
              </button>
              {copyConfirmOpen && (
                <>
                  <div
                    className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                    onClick={() => setCopyConfirmOpen(false)}
                    aria-hidden="true"
                  >
                    <div
                      className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full"
                      onClick={(e) => e.stopPropagation()}
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="copy-confirm-title"
                    >
                      <h3 id="copy-confirm-title" className="text-lg font-semibold text-gray-900 mb-2">
                        Copy previous week?
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        This will replace this week&apos;s roster with the previous week. Current shifts will be overwritten.
                      </p>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setCopyConfirmOpen(false)}
                          className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCopyConfirmOpen(false)
                            void handleCopyPreviousWeek()
                          }}
                          className="px-4 py-2 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-700"
                        >
                          Yes, copy
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={handleClearWeek}
                disabled={loading || sharing || entries.length === 0 || rosterLockedEdit}
                className="flex-1 md:flex-none min-h-[44px] md:min-h-0 px-3 py-2.5 md:py-1.5 border border-red-600 text-red-700 rounded text-xs font-semibold hover:bg-red-50 disabled:opacity-60"
              >
                Clear week
              </button>
              <div className="flex flex-1 justify-end md:flex-none md:shrink-0 min-w-0">
                <button
                  ref={shareTriggerRef}
                  type="button"
                  onClick={() => setShareMenuOpen((o) => !o)}
                  disabled={sharing || entries.length === 0}
                  className="w-full md:w-auto min-h-[44px] md:min-h-0 px-3 py-2.5 md:py-1.5 border border-indigo-600 text-indigo-700 rounded text-xs font-semibold hover:bg-indigo-50 disabled:opacity-60"
                >
                  Share ▼
                </button>
                {shareMenuOpen &&
                  shareMenuPos &&
                  typeof document !== 'undefined' &&
                  createPortal(
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => { setShareMenuOpen(false); setSmsSubmenuOpen(false) }} aria-hidden />
                    <div
                      ref={shareMenuRef}
                      style={{
                        position: 'fixed',
                        top: shareMenuPos.top,
                        left: shareMenuLeft ?? shareMenuPos.left ?? 0,
                        zIndex: 50
                      }}
                      className="w-max max-w-[min(100vw-1rem,280px)] py-1 bg-white border border-gray-200 rounded shadow-lg"
                    >
                      <button
                        type="button"
                        onClick={() => { void handleWhatsAppShare(); setShareMenuOpen(false) }}
                        disabled={sharing}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                      >
                        WhatsApp (Image)
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleWhatsAppTextShare(); setShareMenuOpen(false) }}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                      >
                        WhatsApp (Text)
                      </button>
                      <button
                        type="button"
                        onClick={openWhatsAppDirectModal}
                        disabled={sharing}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                      >
                        WhatsApp (Direct)
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setSmsSubmenuOpen((o) => !o)}
                          disabled={staffWithMobile.length === 0}
                          className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-60 flex justify-between items-center"
                        >
                          SMS
                          <span className="text-xs">{smsSubmenuOpen ? '▲' : '▶'}</span>
                        </button>
                        {smsSubmenuOpen && (
                          <div className="absolute z-30 left-0 right-0 top-full mt-1 md:left-full md:right-auto md:top-0 md:mt-0 md:ml-1 min-w-[160px] max-h-[50vh] overflow-y-auto py-1 bg-white border border-gray-200 rounded shadow-lg">
                            {staffWithMobile.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => handleSendSmsToStaff(s)}
                                className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                              >
                                {s.firstName?.trim() || s.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { void handleEmailShare(); setShareMenuOpen(false) }}
                        disabled={sharing}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Email
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintRoster}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                      >
                        Print
                      </button>
                    </div>
                  </>,
                  document.body
                )}
              </div>
              <span className="text-[11px] text-gray-500 w-full md:w-auto md:min-w-[140px] md:text-right pt-1 md:pt-0 border-t border-black/5 md:border-0">
                {rosterLockedEdit
                  ? 'Read-only'
                  : lockedDaysInWeek.length > 0 && isViewingCurrentWeek
                    ? saving
                      ? 'Saving…'
                      : `Past days locked · ${weekDates.length - lockedDaysInWeek.length} day${weekDates.length - lockedDaysInWeek.length === 1 ? '' : 's'} editable`
                    : saving
                      ? 'Saving…'
                      : 'All changes saved'}
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
            <>
              {/* Mobile: one card per staff, full-width day rows (no horizontal table scroll) */}
              <div className="md:hidden px-2 pb-4 space-y-3">
                <div
                  className="sticky z-20 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm"
                  style={{ top: rosterStickyOffsets.banner }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Coverage by day
                    {countGhostFootnote ? (
                      <span className="block mt-0.5 text-[10px] font-normal normal-case text-gray-400">
                        Active only · {countGhostFootnote}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
                    {weekDates.map((date, idx) => {
                      const counts = countByDayAndShift.get(date)
                      const ph = publicHolidays.find((h) => h.date === date)
                      if (!counts) {
                        return (
                          <div
                            key={date}
                            className="snap-start shrink-0 w-[132px] rounded-lg border border-gray-200 bg-white px-2 py-2 text-center text-[11px] text-gray-400"
                          >
                            {dayLabels[idx]}
                          </div>
                        )
                      }
                      const items: { label: string; count: number; color?: string }[] = []
                      templates.forEach((t) => {
                        const n = counts.get(t.id) ?? 0
                        if (n > 0) items.push({ label: t.name, count: n, color: t.color ?? undefined })
                      })
                      const offCount = counts.get('off') ?? 0
                      if (offCount > 0) items.push({ label: 'Off', count: offCount })
                      const dayTooltip = rosterCountDayTooltip(ghostShiftCountByDay.get(date) ?? 0)
                      return (
                        <div
                          key={date}
                          title={dayTooltip}
                          className={`snap-start shrink-0 w-[132px] rounded-lg border px-2 py-2 ${
                            ph?.stationClosed
                              ? 'border-amber-200 bg-amber-50/90'
                              : ph
                                ? 'border-indigo-200 bg-indigo-50/80'
                                : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="text-center text-[11px] font-bold text-gray-800">
                            {dayLabels[idx]}{' '}
                            <span className="font-normal text-gray-600">{formatDisplayDate(date)}</span>
                          </div>
                          {ph && (
                            <div
                              className={`text-[10px] mt-0.5 text-center font-semibold leading-tight ${
                                ph.stationClosed ? 'text-amber-900' : 'text-indigo-800'
                              }`}
                            >
                              {ph.name}
                            </div>
                          )}
                          <div className="mt-1.5 flex flex-wrap justify-center gap-1 text-[10px] text-gray-700">
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
                        </div>
                      )
                    })}
                  </div>
                </div>

                {displayStaff.map((s, index) => {
                  const ghost = isGhostRosterStaff(s)
                  return (
                  <div
                    key={s.id}
                    className={`rounded-xl border shadow-sm overflow-visible ${
                      ghost ? 'border-gray-200 bg-gray-50/80 opacity-80' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50/90">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {!rosterLockedEdit && !ghost && (
                          <div className="flex shrink-0 rounded-lg border border-gray-200 bg-white overflow-hidden divide-x divide-gray-200">
                            <button
                              type="button"
                              onClick={() => handleMoveStaff(index, 'up')}
                              disabled={index === 0}
                              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none"
                              title="Move up"
                              aria-label="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStaff(index, 'down')}
                              disabled={index === displayStaff.length - 1}
                              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none"
                              title="Move down"
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                          </div>
                        )}
                        <div
                          className={`font-semibold truncate text-base flex items-center gap-1 min-w-0 ${
                            ghost
                              ? 'text-gray-500'
                              : staffBelowMinOff.has(s.id)
                                ? 'roster-staff-off-days-warning'
                                : 'text-gray-900'
                          }`}
                          title={ghost ? GHOST_ROSTER_STAFF_TITLE : staffOffDaysWarningTitle(s)}
                        >
                          {ghost ? (
                            <span className="shrink-0 text-sm" role="img" aria-label="Inactive staff">
                              👻
                            </span>
                          ) : null}
                          <span className="truncate">{s.firstName?.trim() || s.name}</span>
                        </div>
                      </div>
                      {!rosterLockedEdit && !ghost && (
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            title="Fill entire week"
                            aria-label="Fill entire week"
                            onClick={() =>
                              setFillWeekPopover(
                                fillWeekPopover?.staffId === s.id
                                  ? null
                                  : { staffId: s.id, shiftId: templates[0]?.id ?? '' }
                              )
                            }
                            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-100"
                          >
                            <svg
                              className="w-5 h-5 shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </button>
                          {fillWeekPopover?.staffId === s.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setFillWeekPopover(null)} />
                              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-3 w-[min(calc(100vw-2rem),16rem)]">
                                <p className="text-xs font-semibold text-gray-700 mb-2">Fill entire week</p>
                                <select
                                  value={fillWeekPopover.shiftId}
                                  onChange={(e) =>
                                    setFillWeekPopover({ ...fillWeekPopover, shiftId: e.target.value })
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-2 text-base mb-2"
                                >
                                  <option value="">Off</option>
                                  {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => fillWeekForStaff(s.id, fillWeekPopover.shiftId || null)}
                                    className="flex-1 min-h-[44px] px-2 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700"
                                  >
                                    Apply
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFillWeekPopover(null)}
                                    className="flex-1 min-h-[44px] px-2 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="divide-y divide-gray-100">
                      {weekDates.map((date, idx) => {
                        const onVacation = isOnVacation(s, date)
                        const onSickLeave = isOnSickLeave(s.id, date)
                        const ph = publicHolidays.find((h) => h.date === date)
                        const stationClosedHoliday = ph?.stationClosed
                        const dayOffRequest = getDayOffRequestFor(s.id, date)
                        const parsedDayOffRequest = dayOffRequest
                          ? parseDayOffRequestReason(dayOffRequest.reason)
                          : null
                        const requestedTemplateName =
                          parsedDayOffRequest?.type === 'shift' && parsedDayOffRequest.shiftTemplateId
                            ? templates.find((t) => t.id === parsedDayOffRequest.shiftTemplateId)?.name
                            : null
                        const entry = getEntryFor(s.id, date)
                        const callOut = getCallOutFor(s.id, date)
                        const blockedScheduledByLeave =
                          !!entry?.shiftTemplateId &&
                          (onVacation || onSickLeave || parsedDayOffRequest?.type === 'off')
                        const template = getTemplateForEntry(entry)
                        const bgColor = template?.color || undefined
                        const birthday = isBirthdayOnDate(s, date)
                        const cellLocked = isCellLocked(date) || ghost
                        const lastWeekHint = getLastWeekTooltip(s.id, date)
                        return (
                          <div
                            key={date}
                            className="flex gap-2 px-3 py-2.5 items-start"
                            title={lastWeekHint}
                            style={
                              onVacation
                                ? { backgroundColor: '#f3f4f6' }
                                : onSickLeave
                                  ? { backgroundColor: '#ffe4e6' }
                                  : stationClosedHoliday
                                    ? { backgroundColor: '#fff7ed' }
                                    : bgColor
                                      ? { backgroundColor: bgColor }
                                      : undefined
                            }
                          >
                            <div className="w-[5.25rem] shrink-0 pt-0.5">
                              <div className="text-xs font-bold text-gray-800">{dayLabels[idx]}</div>
                              <div className="text-[11px] text-gray-600">{formatDisplayDate(date)}</div>
                              {ph && !stationClosedHoliday && (
                                <div className="text-[10px] mt-0.5 font-semibold text-indigo-800 leading-tight">
                                  {ph.name}
                                </div>
                              )}
                              {stationClosedHoliday && ph && (
                                <div className="text-[10px] mt-0.5 font-semibold text-amber-900 leading-tight">
                                  Closed · {ph.name}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {birthday ? (
                                  <span className="text-sm" title="Birthday" role="img" aria-label="Birthday">
                                    🎂
                                  </span>
                                ) : null}
                                {parsedDayOffRequest?.type === 'off' ? (
                                  <span
                                    className="text-sm"
                                    title={`Off day request${parsedDayOffRequest.reason ? `: ${parsedDayOffRequest.reason}` : ''}`}
                                    role="img"
                                    aria-label="Off day request"
                                  >
                                    🙋
                                  </span>
                                ) : null}
                                {parsedDayOffRequest?.type === 'shift' ? (
                                  <span
                                    className="text-sm"
                                    title={`Shift request${requestedTemplateName ? `: ${requestedTemplateName}` : ''}${parsedDayOffRequest.reason ? ` (${parsedDayOffRequest.reason})` : ''}`}
                                    role="img"
                                    aria-label="Shift request"
                                  >
                                    ⭐
                                  </span>
                                ) : null}
                                <CallOutMarker callOut={callOut} sickOverlap={!!callOut && onSickLeave} />
                                {blockedScheduledByLeave ? (
                                  <span
                                    className="inline-flex items-center rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700"
                                    title="Shift assignment exists but is blocked by leave/day-off request"
                                  >
                                    Blocked
                                  </span>
                                ) : null}
                              </div>
                              {onVacation ? (
                                <span className="text-sm font-medium text-gray-600">Vacation</span>
                              ) : onSickLeave ? (
                                <span className="text-sm font-medium text-rose-700">Sick leave</span>
                              ) : stationClosedHoliday ? (
                                <div className="text-sm text-amber-900">
                                  <span className="font-semibold">Station closed</span>
                                  {ph?.name ? <span className="block text-xs mt-0.5">{ph.name}</span> : null}
                                </div>
                              ) : cellLocked ? (
                                <span className="text-sm font-medium text-gray-800">
                                  {ph && !ph.stationClosed ? (
                                    <>
                                      <span className="block text-xs text-indigo-700 mb-0.5">{ph.name}</span>
                                      {template?.name || 'Off'}
                                    </>
                                  ) : (
                                    template?.name || 'Off'
                                  )}
                                </span>
                              ) : (
                                <select
                                  value={entry?.shiftTemplateId || ''}
                                  disabled={onSickLeave || onVacation}
                                  onChange={(e) =>
                                    setEntryFor(
                                      s.id,
                                      date,
                                      e.target.value === '' ? null : e.target.value
                                    )
                                  }
                                  className="w-full min-h-[48px] px-2 py-2 border border-gray-300 rounded-lg text-base bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">Off</option>
                                  {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )})}
              </div>

              <div className="hidden md:block relative rounded-b-lg">
              <div
                className="sticky z-30 bg-white shadow-sm border-b border-gray-200"
                style={{ top: rosterStickyOffsets.banner }}
              >
                <div
                  ref={topScrollRef}
                  className="h-4 overflow-x-auto overflow-y-hidden bg-white roster-top-x-scroll"
                  aria-hidden="true"
                >
                  <div ref={topScrollContentRef} className="h-px" />
                </div>
                <div ref={headerScrollRef} className="roster-table-x-scroll overflow-x-auto">
                  <table className="min-w-full w-full table-fixed border-separate border-spacing-0 text-sm">
                    {rosterTableColGroup}
                    <thead className={weekBannerStyle.bg}>
                  <tr>
                    <th className={`px-4 py-2 text-left text-xs font-medium uppercase tracking-wider align-top ${weekBannerStyle.bg} ${weekBannerStyle.text}`}>
                      Staff
                    </th>
                    {weekDates.map((date, idx) => {
                      const ph = publicHolidays.find((h) => h.date === date)
                      const dayLocked = isRosterDayLocked(date, weekStart, todayIso)
                      return (
                        <th
                          key={date}
                          className={`px-2 py-2 text-center text-xs font-medium uppercase tracking-wider ${
                            ph?.stationClosed
                              ? 'bg-amber-100 text-amber-950'
                              : ph
                                ? 'bg-indigo-50 text-indigo-950'
                                : dayLocked
                                  ? 'bg-gray-200 text-gray-700'
                                  : `${weekBannerStyle.bg} ${weekBannerStyle.text}`
                          }`}
                          title={dayLocked ? 'This day is locked' : undefined}
                        >
                          <div>{dayLabels[idx]}</div>
                          <div className="text-[11px] opacity-80">
                            {formatDisplayDate(date)}
                          </div>
                          {dayLocked && (
                            <div className="text-[9px] mt-0.5 font-semibold normal-case opacity-80">
                              Locked
                            </div>
                          )}
                          {ph && (
                            <div
                              className={`text-[10px] mt-0.5 font-semibold normal-case leading-tight ${
                                ph.stationClosed ? 'text-amber-900' : 'text-indigo-800'
                              }`}
                            >
                              {ph.name}
                            </div>
                          )}
                        </th>
                      )
                    })}
                  </tr>
                  {/* Running count row: per-day shift totals (sticky with day headers) */}
                  <tr className="border-b border-gray-200">
                    <th
                      scope="row"
                      className="px-4 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider align-bottom bg-gray-50"
                    >
                      Count
                      {countGhostFootnote ? (
                        <div className="text-[9px] font-normal normal-case text-gray-400 mt-0.5 leading-tight">
                          Active only · {countGhostFootnote}
                        </div>
                      ) : null}
                    </th>
                    {weekDates.map((date) => {
                      const counts = countByDayAndShift.get(date)
                      if (!counts) {
                        return <th key={date} scope="col" className="px-1 py-1 bg-gray-50" />
                      }
                      const items: { label: string; count: number; color?: string }[] = []
                      templates.forEach((t) => {
                        const n = counts.get(t.id) ?? 0
                        if (n > 0) items.push({ label: t.name, count: n, color: t.color ?? undefined })
                      })
                      const offCount = counts.get('off') ?? 0
                      if (offCount > 0) items.push({ label: 'Off', count: offCount })
                      const dayTooltip = rosterCountDayTooltip(ghostShiftCountByDay.get(date) ?? 0)
                      return (
                        <th
                          key={date}
                          scope="col"
                          title={dayTooltip}
                          className="px-1 py-1.5 text-center align-bottom bg-gray-50"
                        >
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
                        </th>
                      )
                    })}
                  </tr>
                    </thead>
                  </table>
                </div>
              </div>
              <div ref={tableScrollRef} className="roster-table-x-scroll overflow-x-auto">
                <table className="min-w-full w-full table-fixed border-separate border-spacing-0 text-sm">
                  {rosterTableColGroup}
                  <tbody className="bg-white divide-y divide-gray-200">
                  {displayStaff.map((s, index) => {
                    const ghost = isGhostRosterStaff(s)
                    return (
                    <tr key={s.id} className={ghost ? 'bg-gray-50/80 opacity-80' : 'hover:bg-gray-50'}>
                      <td className="px-2 py-2 align-top text-xs sm:text-sm min-w-[7.5rem]">
                        <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <div className="flex flex-col shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveStaff(index, 'up')}
                              disabled={index === 0 || rosterLockedEdit || ghost}
                              className="p-0.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
                              title="Move up"
                              aria-label="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveStaff(index, 'down')}
                              disabled={index === displayStaff.length - 1 || rosterLockedEdit || ghost}
                              className="p-0.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
                              title="Move down"
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                          </div>
                          <div className={`font-medium min-w-0 break-words flex items-center gap-1 ${
                              ghost
                                ? 'text-gray-500'
                                : staffBelowMinOff.has(s.id)
                                  ? 'roster-staff-off-days-warning'
                                  : 'text-gray-900'
                            }`}
                            title={ghost ? GHOST_ROSTER_STAFF_TITLE : staffOffDaysWarningTitle(s)}
                          >
                            {ghost ? (
                              <span className="shrink-0 text-sm" role="img" aria-label="Inactive staff">
                                👻
                              </span>
                            ) : null}
                            <span>{s.firstName?.trim() || s.name}</span>
                          </div>
                        </div>
                        {!rosterLockedEdit && !ghost && (
                          <div className="relative ml-0 pl-7 sm:pl-8">
                            <button
                              type="button"
                              title="Fill entire week"
                              aria-label="Fill entire week"
                              onClick={() =>
                                setFillWeekPopover(
                                  fillWeekPopover?.staffId === s.id
                                    ? null
                                    : { staffId: s.id, shiftId: templates[0]?.id ?? '' }
                                )
                              }
                              className="inline-flex items-center justify-center text-gray-400 hover:text-blue-600 p-0.5 rounded hover:bg-blue-50 transition-colors"
                            >
                              <svg
                                className="w-3.5 h-3.5 shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                            {fillWeekPopover?.staffId === s.id && (
                              <>
                                {/* Backdrop — clicking outside closes the popover */}
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setFillWeekPopover(null)}
                                />
                              <div
                                className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-3 w-44"
                              >
                                <p className="text-xs font-semibold text-gray-700 mb-2">Fill entire week</p>
                                <select
                                  value={fillWeekPopover.shiftId}
                                  onChange={(e) => setFillWeekPopover({ ...fillWeekPopover, shiftId: e.target.value })}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs mb-2"
                                >
                                  <option value="">Off</option>
                                  {templates.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => fillWeekForStaff(s.id, fillWeekPopover.shiftId || null)}
                                    className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700"
                                  >
                                    Apply
                                  </button>
                                  <button
                                    onClick={() => setFillWeekPopover(null)}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                              </>
                            )}
                          </div>
                        )}
                        </div>
                      </td>
                      {weekDates.map((date) => {
                        const onVacation = isOnVacation(s, date)
                        const onSickLeave = isOnSickLeave(s.id, date)
                        const ph = publicHolidays.find((h) => h.date === date)
                        const stationClosedHoliday = ph?.stationClosed
                        const dayOffRequest = getDayOffRequestFor(s.id, date)
                        const parsedDayOffRequest = dayOffRequest
                          ? parseDayOffRequestReason(dayOffRequest.reason)
                          : null
                        const requestedTemplateName =
                          parsedDayOffRequest?.type === 'shift' && parsedDayOffRequest.shiftTemplateId
                            ? templates.find((t) => t.id === parsedDayOffRequest.shiftTemplateId)?.name
                            : null
                        const entry = getEntryFor(s.id, date)
                        const callOut = getCallOutFor(s.id, date)
                        const blockedScheduledByLeave =
                          !!entry?.shiftTemplateId &&
                          (onVacation || onSickLeave || parsedDayOffRequest?.type === 'off')
                        const template = getTemplateForEntry(entry)
                        const bgColor = template?.color || undefined
                        const birthday = isBirthdayOnDate(s, date)
                        const cellLocked = isCellLocked(date) || ghost
                        const lastWeekHint = getLastWeekTooltip(s.id, date)
                        return (
                          <td
                            key={date}
                            className="px-1 py-1 text-center align-middle"
                            title={lastWeekHint}
                            style={
                              onVacation
                                ? { backgroundColor: '#f3f4f6' }
                                : onSickLeave
                                  ? { backgroundColor: '#ffe4e6' }
                                : stationClosedHoliday
                                  ? { backgroundColor: '#fff7ed' }
                                  : bgColor
                                    ? { backgroundColor: bgColor }
                                    : undefined
                            }
                          >
                            <div className="flex flex-col items-center gap-0.5 justify-center min-h-[1.25rem]">
                              {birthday ? (
                                <span
                                  className="text-[13px] leading-none select-none"
                                  title="Birthday"
                                  role="img"
                                  aria-label="Birthday"
                                >
                                  🎂
                                </span>
                              ) : null}
                              {parsedDayOffRequest?.type === 'off' ? (
                                <span
                                  className="text-[12px] leading-none select-none"
                                  title={`Off day request${parsedDayOffRequest.reason ? `: ${parsedDayOffRequest.reason}` : ''}`}
                                  role="img"
                                  aria-label="Off day request"
                                >
                                  🙋
                                </span>
                              ) : null}
                              {parsedDayOffRequest?.type === 'shift' ? (
                                <span
                                  className="text-[12px] leading-none select-none"
                                  title={`Shift request${requestedTemplateName ? `: ${requestedTemplateName}` : ''}${parsedDayOffRequest.reason ? ` (${parsedDayOffRequest.reason})` : ''}`}
                                  role="img"
                                  aria-label="Shift request"
                                >
                                  ⭐
                                </span>
                              ) : null}
                              <CallOutMarker callOut={callOut} sickOverlap={!!callOut && onSickLeave} />
                              {blockedScheduledByLeave ? (
                                <span
                                  className="inline-flex items-center rounded border border-rose-300 bg-rose-50 px-1 py-[1px] text-[9px] font-bold uppercase tracking-wide text-rose-700"
                                  title="Shift assignment exists but is blocked by leave/day-off request"
                                >
                                  Blocked
                                </span>
                              ) : null}
                              {onVacation ? (
                                <span className="text-xs font-medium text-gray-500">Vacation</span>
                              ) : onSickLeave ? (
                                <span className="text-xs font-medium text-rose-700">Sick leave</span>
                              ) : stationClosedHoliday ? (
                                <div className="px-0.5 py-1">
                                  <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                                    Closed
                                  </div>
                                  <div className="text-[10px] text-amber-800 leading-tight mt-0.5">{ph?.name}</div>
                                </div>
                              ) : cellLocked ? (
                                <span className="text-xs font-medium text-gray-700">
                                  {ph && !ph.stationClosed ? (
                                    <>
                                      <span className="block text-[9px] text-indigo-700 mb-0.5">{ph.name}</span>
                                      {template?.name || 'Off'}
                                    </>
                                  ) : (
                                    template?.name || 'Off'
                                  )}
                                </span>
                              ) : (
                                <select
                                  value={entry?.shiftTemplateId || ''}
                                  disabled={onSickLeave || onVacation}
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
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )})}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}
        </div>

        {/* Day Off Request Modal */}
        {showDayOffModal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowDayOffModal(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="day-off-modal-title"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 id="day-off-modal-title" className="text-lg font-semibold text-gray-900">
                  Day Off Request
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDayOffModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member</label>
                  <select
                    value={dayOffStaffId}
                    onChange={(e) => setDayOffStaffId(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— Select staff —</option>
                    {allStaff
                      .filter((s) => s.status === 'active' && s.role !== 'manager')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.firstName?.trim() || s.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={dayOffDate}
                    onChange={(e) => setDayOffDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Request Type</label>
                  <select
                    value={dayOffRequestType}
                    onChange={(e) => setDayOffRequestType(e.target.value as 'off' | 'shift')}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="off">Off day request</option>
                    <option value="shift">Specific shift request</option>
                  </select>
                </div>

                {dayOffRequestType === 'shift' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Requested Shift</label>
                    <select
                      value={dayOffShiftTemplateId}
                      onChange={(e) => setDayOffShiftTemplateId(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">— Select shift —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={dayOffReason}
                    onChange={(e) => setDayOffReason(e.target.value)}
                    placeholder="e.g. Doctor appointment"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAddDayOff() }}
                  />
                </div>

                {dayOffSuccess && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                    Day off request saved successfully.
                  </p>
                )}
              </div>

              <div className="flex gap-2 justify-end mt-5">
                <button
                  type="button"
                  onClick={() => setShowDayOffModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddDayOff()}
                  disabled={!dayOffStaffId || !dayOffDate || savingDayOff || (dayOffRequestType === 'shift' && !dayOffShiftTemplateId)}
                  className="px-4 py-2 bg-amber-500 text-white rounded text-sm font-semibold hover:bg-amber-600 disabled:opacity-60"
                >
                  {savingDayOff ? 'Saving…' : 'Save Request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vacation Modal */}
        {showVacationModal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowVacationModal(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="vacation-modal-title"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 id="vacation-modal-title" className="text-lg font-semibold text-gray-900">
                  Vacation
                </h3>
                <button
                  type="button"
                  onClick={() => setShowVacationModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Staff on vacation cannot be scheduled in the roster during this period.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member</label>
                  <select
                    value={vacationStaffId}
                    onChange={(e) => handleVacationStaffChange(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    <option value="">— Select staff —</option>
                    {allStaff
                      .filter((s) => s.status === 'active' && s.role !== 'manager')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.firstName?.trim() || s.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="date"
                      value={vacationStartDate}
                      onChange={(e) => setVacationStartDate(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="date"
                      value={vacationEndDate}
                      onChange={(e) => setVacationEndDate(e.target.value)}
                      min={vacationStartDate}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                </div>

                {vacationStaffId && (
                  <p className="text-xs text-gray-500">
                    <a
                      href={`/staff/${vacationStaffId}`}
                      className="text-violet-600 hover:text-violet-800 font-medium"
                    >
                      Open staff profile
                    </a>
                    {' '}for full details and documents.
                  </p>
                )}

                {vacationSuccess && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                    Vacation saved successfully.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 justify-end mt-5">
                {hasExistingVacation && (
                  <button
                    type="button"
                    onClick={() => void handleClearVacation()}
                    disabled={!vacationStaffId || savingVacation}
                    className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded text-sm font-medium hover:bg-red-100 disabled:opacity-60 mr-auto"
                  >
                    Clear vacation
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowVacationModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveVacation()}
                  disabled={
                    !vacationStaffId ||
                    !vacationStartDate ||
                    !vacationEndDate ||
                    savingVacation ||
                    vacationEndDate < vacationStartDate
                  }
                  className="px-4 py-2 bg-violet-500 text-white rounded text-sm font-semibold hover:bg-violet-600 disabled:opacity-60"
                >
                  {savingVacation ? 'Saving…' : 'Save Vacation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sick Leave Modal */}
        {showSickLeaveModal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowSickLeaveModal(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sick-leave-modal-title"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 id="sick-leave-modal-title" className="text-lg font-semibold text-gray-900">
                  Sick Leave
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSickLeaveModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member</label>
                  <select
                    value={sickLeaveStaffId}
                    onChange={(e) => setSickLeaveStaffId(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  >
                    <option value="">— Select staff —</option>
                    {allStaff
                      .filter((s) => s.status === 'active' && s.role !== 'manager')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.firstName?.trim() || s.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="date"
                      value={sickLeaveStartDate}
                      onChange={(e) => setSickLeaveStartDate(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="date"
                      value={sickLeaveEndDate}
                      onChange={(e) => setSickLeaveEndDate(e.target.value)}
                      min={sickLeaveStartDate}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={sickLeaveReason}
                    onChange={(e) => setSickLeaveReason(e.target.value)}
                    placeholder="e.g. Flu"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAddSickLeave() }}
                  />
                </div>

                {sickLeaveSuccess && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                    Sick leave saved successfully.
                  </p>
                )}
              </div>

              <div className="flex gap-2 justify-end mt-5">
                <button
                  type="button"
                  onClick={() => setShowSickLeaveModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddSickLeave()}
                  disabled={!sickLeaveStaffId || !sickLeaveStartDate || savingSickLeave || !!(sickLeaveEndDate && sickLeaveEndDate < sickLeaveStartDate)}
                  className="px-4 py-2 bg-rose-500 text-white rounded text-sm font-semibold hover:bg-rose-600 disabled:opacity-60"
                >
                  {savingSickLeave ? 'Saving…' : 'Save Sick Leave'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showCallOutModal && canLogCallOut ? (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowCallOutModal(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="call-out-modal-title"
            >
              <h3 id="call-out-modal-title" className="text-lg font-semibold text-gray-900 mb-4">
                Call out
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Staff member</label>
                  <select
                    value={callOutStaffId}
                    onChange={(e) => {
                      const id = e.target.value
                      setCallOutStaffId(id)
                      syncCallOutFormForSelection(id, callOutDate)
                    }}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="">— Select staff —</option>
                    {allStaff
                      .filter((s) => s.status === 'active' && s.role !== 'manager')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.firstName?.trim() || s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work date</label>
                  <input
                    type="date"
                    value={callOutDate}
                    onChange={(e) => {
                      const d = e.target.value
                      setCallOutDate(d)
                      syncCallOutFormForSelection(callOutStaffId, d)
                    }}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                {callOutStaffId &&
                callOutDate &&
                getCallOutFor(callOutStaffId, callOutDate) &&
                isOnSickLeave(callOutStaffId, callOutDate) ? (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                    Sick leave also covers this day — call out is kept for the phone log.
                  </p>
                ) : null}
                <CallOutCalledAtFields
                  value={callOutCalledAtParts}
                  onChange={setCallOutCalledAtParts}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={callOutNotes}
                    onChange={(e) => setCallOutNotes(e.target.value)}
                    placeholder="e.g. Sick — not coming in"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-between gap-2 mt-6">
                {callOutStaffId &&
                callOutDate &&
                getCallOutFor(callOutStaffId, callOutDate) ? (
                  <button
                    type="button"
                    onClick={() => void handleDeleteCallOut()}
                    disabled={savingCallOut}
                    className="px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCallOutModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveCallOut()}
                    disabled={savingCallOut || !callOutStaffId || !callOutDate}
                    className="px-4 py-2 bg-teal-600 text-white rounded text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                  >
                    {savingCallOut ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* WhatsApp Direct modal: send to all staff with mobile numbers */}
        {showWhatsAppModal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowWhatsAppModal(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Send Roster via WhatsApp</h3>

              {whatsappStep === 'warning' && whatsappStaffWithoutMobile.length > 0 && (
                <>
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-4">
                    <p className="text-sm font-medium text-amber-800 mb-2">
                      The following staff don&apos;t have mobile numbers and won&apos;t receive the roster:
                    </p>
                    <ul className="text-sm text-amber-700 list-disc list-inside">
                      {whatsappStaffWithoutMobile.map((s) => (
                        <li key={s.id}>{s.firstName?.trim() || s.name}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-600 mt-2">
                      Cancel to add their numbers in Staff settings, or continue to send to the rest.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowWhatsAppModal(false)}
                      className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setWhatsappStep('confirm')}
                      className="px-4 py-2 bg-amber-600 text-white rounded font-medium hover:bg-amber-700"
                    >
                      Continue
                    </button>
                  </div>
                </>
              )}

              {whatsappStep === 'confirm' && (
                <>
                  <div className="space-y-4 mb-4">
                    {whatsappStaffWithMobile.length === 0 ? (
                      <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
                        No staff have mobile numbers. Add them in Staff settings.
                      </p>
                    ) : (
                      <>
                    <p className="text-sm text-gray-700">
                      Send roster to <strong>{whatsappStaffWithMobile.length}</strong> staff member{whatsappStaffWithMobile.length !== 1 ? 's' : ''}:
                    </p>
                    <ul className="text-sm text-gray-600 max-h-32 overflow-y-auto">
                      {whatsappStaffWithMobile.map((s) => (
                        <li key={s.id}>• {s.firstName?.trim() || s.name}</li>
                      ))}
                    </ul>
                    </>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowWhatsAppModal(false)}
                      className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleWhatsAppDirectSend()}
                      disabled={sharing || whatsappStaffWithMobile.length === 0}
                      className="px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {sharing ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

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
                {displayStaff
                  .filter((s) => !isGhostRosterStaff(s))
                  .map((s) => (
                  <tr key={s.id}>
                    <td className="border px-2 py-1 align-top">
                      <div className={`font-medium ${
                        staffBelowMinOff.has(s.id) ? 'roster-staff-off-days-warning' : 'text-gray-900'
                      }`}
                      title={staffOffDaysWarningTitle(s)}
                    >
                      {s.firstName?.trim() || s.name}</div>
                    </td>
                    {weekDates.map((date) => {
                      const entry = getEntryFor(s.id, date)
                      const label = shareCellLabel(s, date)
                      const tmpl = getTemplateForEntry(entry)
                      const onVacation = isOnVacation(s, date)
                      const bg = onVacation ? '#f3f4f6' : (tmpl?.color || '#f9fafb')
                      const birthday = isBirthdayOnDate(s, date)
                      return (
                        <td
                          key={date}
                          className="border px-2 py-1 text-center align-middle"
                          style={{ backgroundColor: bg }}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            {birthday ? <span className="text-[11px] leading-none">🎂</span> : null}
                            <span>{label}</span>
                          </div>
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

