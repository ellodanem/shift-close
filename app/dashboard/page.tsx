'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  type DashboardWidgetId,
  getDefaultLayout,
  loadDashboardLayout,
  saveDashboardLayout,
  moveWidgetUp,
  moveWidgetDown,
  buildDashboardSegments,
  isPinnedTopDashboardWidget
} from '@/lib/dashboard-layout'
import { getDashboardWidgetIdsForRole } from '@/lib/roles'
import type { StaleArPayload } from '@/lib/customer-ar-stale-payments'
import { useAuth } from '@/app/components/AuthContext'
import { IconRepeat, IconSelect } from '@/app/components/IconDropdown'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { shouldRefetchOnVisibility } from '@/lib/refetch-on-visibility'
import HomeShortcutStrip from '@/app/components/HomeShortcutStrip'

type ReminderRecurrence = '' | 'weekly' | 'biweekly' | 'monthly'

const REMINDER_RECURRENCE_OPTIONS: { value: ReminderRecurrence; label: string }[] = [
  { value: '', label: 'One-time' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' }
]

interface MonthSummary {
  year: number
  month: number
  monthName: string
  totals: {
    deposits: number
    debitAndCredit: number
    debit: number
    credit: number
    fleet: number
    vouchers: number
    inhouse: number
    grandTotal: number
  }
  status: {
    lastShift: {
      date: string
      shift: string
      createdAt: string
    } | null
    pendingReviewCount: number
    incompleteDaysCount: number
    totalOverShort: number
  }
}

interface FuelExpenseSummary {
  month: string
  grandTotal: number
}

interface UpcomingEvent {
  type: 'birthday' | 'invoice' | 'contract' | 'pay-day' | 'other'
  title: string
  date: string
  daysUntil: number
  priority: 'high' | 'medium' | 'low'
  reminderId?: string
  payDayId?: string
}

interface RecentFuelPayment {
  invoices: {
    invoiceNumber: string
    amount: string
    type: string
  }[]
  datePaid: string
  referenceNumber: string
  totalPaid: string
  balanceBefore: string | null
  balanceAfter: string | null
}

interface CustomerArSummary {
  id: string
  year: number
  month: number
  opening: number
  charges: number
  payments: number
  closing: number | null
  chargesPrevious?: number | null
  paymentsPrevious?: number | null
  notes: string
  updatedAt?: string
}

type MonthFilterType = 'currentMonth' | 'previousMonth' | 'custom'

interface TodayPresence {
  status: string
  lateReason: string
  graceEndsAt: string | null
  isExpected: boolean
  manualPresent?: boolean
  manualAbsent?: boolean
  punchExempt?: boolean
}

interface TodayScheduled {
  staffId: string
  staffName: string
  staffFirstName?: string
  shiftName: string
  shiftColor: string | null
  shiftStartTime?: string
  presence?: TodayPresence
}

interface TodayOnVacation {
  staffId: string
  staffName: string
  staffFirstName?: string
}

interface TodayRoster {
  date: string
  weekStart: string
  stationTimeZone?: string
  scheduled: TodayScheduled[]
  onVacation: TodayOnVacation[]
  off: TodayOnVacation[]
  presentAbsenceEnabled?: boolean
  presentAbsenceGraceMinutes?: number
  presentAbsenceLateMinutes?: number
  presentAbsenceAbsentMinutes?: number
}

interface CashbookSummary {
  totalIncome: number
  totalExpense: number
  netIncome: number
  entryCount: number
}

interface FuelComparisonDay {
  date: string
  priorDate: string
  unleaded: number
  diesel: number
  prevUnleaded: number
  prevDiesel: number
}

interface AverageDepositData {
  avgDepositMTD: number
  totalDepositsMTD: number
  daysElapsed: number
  lastShiftDate: string | null
  periodLabel?: string
  sameDayLastMonth: { date: string; total: number } | null
  sameDayLastYear: { date: string; total: number } | null
}

interface FuelMtdSoldPayload {
  year: number
  month: number
  monthName: string
  isFutureMonth?: boolean
  isCurrentMonth?: boolean
  daysInAverage: number
  totalUnleaded: number
  totalDiesel: number
  avgUnleadedPerDay: number
  avgDieselPerDay: number
  periodLabel: string
}

/** Minutes from midnight for unknown labels — sorts after real shift starts. */
const ROSTER_SHIFT_SORT_FALLBACK = 24 * 60 + 10_000

function parseShiftStartTimeToMinutes(t?: string): number | null {
  if (!t?.trim()) return null
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Parse shift labels like "6-1" (6am–1pm), "10-6" (10am–6pm), "1-9" (1pm–9pm) for roster order.
 */
function parseShiftLabelStartMinutes(shiftName: string): number {
  const m = shiftName.trim().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\b/)
  if (!m) return ROSTER_SHIFT_SORT_FALLBACK
  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || a > 12 || b < 1 || b > 12) {
    return ROSTER_SHIFT_SORT_FALLBACK
  }
  if (a > b) {
    if (a === 12) return 12 * 60
    return a * 60
  }
  if (a <= 5) return (a + 12) * 60
  return a * 60
}

function rosterShiftGroupSortMinutes(shiftName: string, scheduled: TodayScheduled[]): number {
  let best: number | null = null
  for (const row of scheduled) {
    if (row.shiftName !== shiftName) continue
    const mins = parseShiftStartTimeToMinutes(row.shiftStartTime)
    if (mins != null && (best === null || mins < best)) best = mins
  }
  if (best !== null) return best
  return parseShiftLabelStartMinutes(shiftName)
}

function staleAccountStatus(row: {
  neverPaid: boolean
  daysSincePayment: number | null
}): { text: string; className: string } {
  if (row.neverPaid) return { text: 'Never paid', className: 'text-red-600' }
  const days = row.daysSincePayment ?? 0
  if (days >= 120) return { text: `${days} days`, className: 'text-red-600' }
  if (days >= 90) return { text: `${days} days`, className: 'text-orange-600' }
  if (days >= 45) return { text: `${days} days`, className: 'text-amber-600' }
  return { text: `${days} days`, className: 'text-slate-500' }
}

function monthKeyFromSummary(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function monthDateRangeFromKey(monthKey: string): { startDate: string; endDate: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    startDate: `${y}-${String(m).padStart(2, '0')}-01`,
    endDate: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }
}

const TRENDS_WIDGET_IDS: DashboardWidgetId[] = [
  'fuel-volume',
  'average-deposit',
  'recent-fuel-payment'
]

function DashboardSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 mt-0.5">
      {children}
    </h2>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading: authLoading, isStakeholder, isSupervisorLike, canLogCallOut, isFullAccess } = useAuth()
  const appRole = user?.role ?? ''
  const [summary, setSummary] = useState<MonthSummary | null>(null)
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([])
  const [recentPayment, setRecentPayment] = useState<RecentFuelPayment | null>(null)
  const [fuelExpense, setFuelExpense] = useState<number | null>(null)
  const [arSummary, setArSummary] = useState<CustomerArSummary | null>(null)
  const [todayRoster, setTodayRoster] = useState<TodayRoster | null>(null)
  const [cashbookSummary, setCashbookSummary] = useState<CashbookSummary | null>(null)
  const [fuelComparison, setFuelComparison] = useState<FuelComparisonDay[]>([])
  const [averageDeposit, setAverageDeposit] = useState<AverageDepositData | null>(null)
  const [fuelMtdSold, setFuelMtdSold] = useState<FuelMtdSoldPayload | null>(null)
  const [fuelMtdLoadState, setFuelMtdLoadState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [fuelMtdView, setFuelMtdView] = useState<'mtd' | 'avg'>('mtd')
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<MonthFilterType>('currentMonth')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const customPickerRef = useRef<HTMLDivElement>(null)
  const fuelMtdReqId = useRef(0)
  const tabHiddenAtRef = useRef<number | null>(null)
  const [reminderModalOpen, setReminderModalOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState({
    title: '',
    date: '',
    notes: '',
    notifyEmail: true,
    notifyWhatsApp: false,
    notifyDaysBefore: '7,3,1,0',
    recurrenceType: '' as ReminderRecurrence,
    recurrenceEndDate: ''
  })
  const [payDayModalOpen, setPayDayModalOpen] = useState(false)
  const [payDayForm, setPayDayForm] = useState({ date: '', notes: '' })
  const [payDaySaving, setPayDaySaving] = useState(false)
  const [presenceModal, setPresenceModal] = useState<{
    staffId: string
    staffName: string
    date: string
    manualPresent: boolean
    manualAbsent: boolean
    punchExempt: boolean
    lateReason: string
  } | null>(null)
  const [presenceSaving, setPresenceSaving] = useState(false)
  const [layout, setLayout] = useState<DashboardWidgetId[]>(getDefaultLayout)
  const [customerAccountsFuelNetExpanded, setCustomerAccountsFuelNetExpanded] = useState(false)
  const [upcomingExpanded, setUpcomingExpanded] = useState(false)
  const [staleArAccounts, setStaleArAccounts] = useState<StaleArPayload | null>(null)

  useEffect(() => {
    if (authLoading) return
    const restricted = getDashboardWidgetIdsForRole(appRole)
    if (restricted === 'all') {
      setLayout(loadDashboardLayout())
    } else {
      setLayout(restricted)
    }
  }, [authLoading, appRole])

  useEffect(() => {
    if (!reminderModalOpen && !payDayModalOpen && !presenceModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReminderModalOpen(false)
        setPayDayModalOpen(false)
        setPresenceModal(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reminderModalOpen, payDayModalOpen, presenceModal])

  // Close custom picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customPickerRef.current && !customPickerRef.current.contains(event.target as Node)) {
        setShowCustomPicker(false)
      }
    }

    if (showCustomPicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCustomPicker])

  const getMonthRange = (
    filter: MonthFilterType
  ): { year: number; month: number } | null => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (filter === 'currentMonth') {
      return {
        year: today.getFullYear(),
        month: today.getMonth() + 1 // 1-indexed
      }
    }

    if (filter === 'previousMonth') {
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      return {
        year: prevMonth.getFullYear(),
        month: prevMonth.getMonth() + 1 // 1-indexed
      }
    }

    if (filter === 'custom') {
      // Custom: use selected month-year, or fall back to current month
      if (customStartDate) {
        const [yearStr, monthStr] = customStartDate.split('-')
        const year = Number(yearStr)
        const month = Number(monthStr)
        if (!Number.isNaN(year) && !Number.isNaN(month)) {
          return { year, month }
        }
      }
      return {
        year: today.getFullYear(),
        month: today.getMonth() + 1
      }
    }

    return null
  }

  const refreshUpcoming = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/upcoming', { cache: 'no-store', credentials: 'same-origin' })
      if (res.ok) {
        const data = await res.json()
        setUpcoming(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error('Error fetching upcoming events:', err)
    }
  }, [])

  const refreshTodayRoster = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/today', { cache: 'no-store', credentials: 'same-origin' })
      if (res.ok) {
        const data = await res.json()
        setTodayRoster(data)
      }
    } catch (err) {
      console.error('Error fetching today roster:', err)
    }
  }, [])

  const loadDashboardBootstrap = useCallback(async () => {
    setLoading(true)
    setFuelMtdLoadState('loading')
    try {
      const range = getMonthRange(activeFilter)
      const params = new URLSearchParams()
      if (range) {
        params.set('year', String(range.year))
        params.set('month', String(range.month))
      }
      const res = await fetch(`/api/dashboard/bootstrap?${params}`, {
        cache: 'no-store',
        credentials: 'same-origin'
      })
      if (!res.ok) throw new Error('Failed to load dashboard')
      const data = await res.json()

      setSummary(data.summary as MonthSummary)
      setFuelExpense(typeof data.fuelExpense === 'number' ? data.fuelExpense : null)
      setUpcoming(Array.isArray(data.upcoming) ? data.upcoming : [])
      setRecentPayment(data.recentPayment ?? null)
      setTodayRoster(data.todayRoster ?? null)

      if (Array.isArray(data.fuelComparison)) setFuelComparison(data.fuelComparison)
      else setFuelComparison([])

      const avg = data.averageDeposit
      if (avg && typeof avg.avgDepositMTD === 'number' && !avg.error) setAverageDeposit(avg)
      else setAverageDeposit(null)

      setArSummary(data.arSummary ?? null)
      setStaleArAccounts(data.staleArAccounts ?? null)

      const cb = data.cashbookSummary
      if (cb && typeof cb.totalIncome === 'number') {
        setCashbookSummary({
          totalIncome: cb.totalIncome ?? 0,
          totalExpense: cb.totalExpense ?? 0,
          netIncome: cb.netIncome ?? 0,
          entryCount: cb.entryCount ?? 0
        })
      } else {
        setCashbookSummary(null)
      }

      const mtd = data.fuelMtdSold as FuelMtdSoldPayload | null | undefined
      if (mtd && typeof mtd.avgUnleadedPerDay === 'number') setFuelMtdSold(mtd)
      else setFuelMtdSold(null)
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
      setFuelMtdLoadState('done')
    }
  }, [activeFilter, customStartDate, customEndDate])

  useEffect(() => {
    if (authLoading) return
    void loadDashboardBootstrap()
  }, [authLoading, loadDashboardBootstrap])

  /** Roster/presence: refetch today only after tab was hidden ≥3 min (punch may have changed). */
  useEffect(() => {
    if (authLoading) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now()
        return
      }
      if (
        document.visibilityState === 'visible' &&
        shouldRefetchOnVisibility(tabHiddenAtRef.current)
      ) {
        tabHiddenAtRef.current = null
        void refreshTodayRoster()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [authLoading, refreshTodayRoster])

  const formatTodayDisplay = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const groupScheduledByShift = (
    items: TodayScheduled[]
  ): {
    shiftName: string
    color: string | null
    entries: { displayName: string; staffId: string; presence?: TodayPresence }[]
  }[] => {
    const map = new Map<
      string,
      { shiftName: string; color: string | null; entries: { displayName: string; staffId: string; presence?: TodayPresence }[] }
    >()
    items.forEach((item) => {
      const displayName = item.staffFirstName ?? item.staffName
      const existing = map.get(item.shiftName)
      const entry = {
        displayName,
        staffId: item.staffId,
        presence: item.presence
      }
      if (existing) {
        existing.entries.push(entry)
      } else {
        map.set(item.shiftName, {
          shiftName: item.shiftName,
          color: item.shiftColor,
          entries: [entry]
        })
      }
    })
    return Array.from(map.values())
  }

  const presenceStatusGlyph = (status: string) => {
    switch (status) {
      case 'present':
        return { char: '✓', title: 'Present', className: 'text-emerald-600' }
      case 'late':
        return { char: '!', title: 'Late', className: 'text-amber-600' }
      case 'absent':
        return { char: '✗', title: 'Absent', className: 'text-red-600' }
      case 'off':
        return { char: '—', title: 'Not expected today', className: 'text-slate-400' }
      case 'pending':
      default:
        return {
          char: '…',
          title: `Before ${todayRoster?.presentAbsenceLateMinutes ?? todayRoster?.presentAbsenceGraceMinutes ?? 15} min after shift start`,
          className: 'text-slate-400'
        }
    }
  }

  const formatCurrency = (num: number): string => {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const customerArDeltaTitle = (
    label: string,
    current: number,
    previous: number | null | undefined
  ): string => {
    if (previous == null || previous === undefined) {
      return `${label}: no prior upload on file for this month yet. After the next import or save, hover will show the change since that update.`
    }
    const d = current - previous
    if (Math.abs(d) < 0.005) {
      return `${label} unchanged since last update (${formatCurrency(current)}).`
    }
    const dir = d > 0 ? 'Up' : 'Down'
    return `${label} ${dir} ${formatCurrency(Math.abs(d))} since last update (was ${formatCurrency(previous)}).`
  }

  const formatLitres = (num: number): string =>
    num.toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 })

  const topStaleAccounts = useMemo(() => {
    if (!staleArAccounts?.accounts.length) return []
    return [...staleArAccounts.accounts]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 4)
  }, [staleArAccounts])

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const visibleLayout = layout.filter((id) => {
    if (id === 'fuel-volume' && fuelComparison.length === 0) return false
    return true
  })

  const showFuelMtdHero = visibleLayout.includes('fuel-mtd-deposit-block')
  const showRecentFuelPaymentHero = visibleLayout.includes('recent-fuel-payment')

  /** Widgets that participate in reorder controls and the scrollable list (excludes pinned top). */
  const reorderableVisibleLayout = useMemo(
    () =>
      visibleLayout.filter((id) => {
        if (isPinnedTopDashboardWidget(id)) return false
        if (id === 'recent-fuel-payment' && showRecentFuelPaymentHero) return false
        return true
      }),
    [visibleLayout, showRecentFuelPaymentHero]
  )

  const dashboardSegments = useMemo(
    () => buildDashboardSegments(reorderableVisibleLayout),
    [reorderableVisibleLayout]
  )

  const handleMoveUp = (id: DashboardWidgetId) => {
    const next = moveWidgetUp(layout, id)
    setLayout(next)
    saveDashboardLayout(next)
  }

  const handleMoveDown = (id: DashboardWidgetId) => {
    const next = moveWidgetDown(layout, id)
    setLayout(next)
    saveDashboardLayout(next)
  }

  const insightCardClass = 'bg-white rounded-xl border border-gray-200 p-4 sm:p-5 h-full min-w-0 flex flex-col'

  const lastUpdatedLabel = summary?.status.lastShift?.createdAt
    ? `Updated ${formatDateTime(summary.status.lastShift.createdAt)}`
    : null

  const renderRecentFuelPaymentCard = () => {
    if (!recentPayment) {
      return (
        <div className={insightCardClass}>
          <h2 className="text-base font-semibold text-gray-900">Recent fuel payment</h2>
          <p className="mt-3 text-sm text-gray-400 italic">No recent fuel payment recorded</p>
        </div>
      )
    }
    return (
      <div className={insightCardClass}>
        <h2 className="text-base font-semibold text-gray-900">
          Fuel Payment – {recentPayment.datePaid}
        </h2>
        <div className="mt-3 text-xs tabular-nums text-gray-800">
          {recentPayment.invoices.map((inv, idx) => (
            <div
              key={`${inv.invoiceNumber}-${idx}`}
              className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0.5 items-baseline"
            >
              <span className="font-mono">{inv.invoiceNumber}</span>
              <span className="text-right">{inv.amount}</span>
              <span className="text-right text-gray-600">{inv.type}</span>
            </div>
          ))}
          <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline">
            <span />
            <span className="text-right font-semibold text-gray-900">{recentPayment.totalPaid}</span>
            <span />
          </div>
        </div>
        <div className="pl-[40%] text-[11px] text-slate-500 space-y-0.5">
          <div>paid {recentPayment.datePaid}</div>
          <div>
            Ref{' '}
            <span className="font-mono text-blue-600">{recentPayment.referenceNumber}</span>
          </div>
        </div>
        {(recentPayment.balanceBefore || recentPayment.balanceAfter) && (
          <div className="mt-3 pt-2 border-t border-gray-100">
            <div className="text-xs font-semibold text-gray-900">Balance Information</div>
            <div className="mt-1 space-y-0.5 text-xs text-gray-700 tabular-nums">
              {recentPayment.balanceBefore ? (
                <div>Balance Before (Available): {recentPayment.balanceBefore}</div>
              ) : null}
              {recentPayment.balanceAfter ? (
                <div>Balance After (Available – Paid): {recentPayment.balanceAfter}</div>
              ) : null}
            </div>
          </div>
        )}
        {!isStakeholder ? (
          <button
            type="button"
            onClick={() => router.push('/fuel-payments/invoices')}
            className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium text-left"
          >
            View all payments →
          </button>
        ) : null}
      </div>
    )
  }

  const renderThisMonthCard = () => {
    if (!summary) return null
    return (
      <div className={insightCardClass}>
        <h2 className="text-base font-semibold text-gray-900">This month</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {summary.monthName} {summary.year}
        </p>
        <div className="mt-3 grid grid-cols-2 divide-x divide-gray-200 sm:grid-cols-3">
          <div className="min-w-0 pr-2 sm:pr-4">
            <div className="text-[11px] text-slate-500 sm:text-xs">Deposit</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-600 sm:text-xl">
              ${formatCurrency(summary.totals.deposits)}
            </div>
          </div>
          <div className="min-w-0 pl-2 sm:px-4">
            <div className="text-[11px] text-slate-500 sm:text-xs">Debit / Credit</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-blue-600 sm:text-xl">
              ${formatCurrency(summary.totals.debitAndCredit)}
            </div>
          </div>
          <div className="col-span-2 min-w-0 border-t border-gray-200 pt-3 sm:col-span-1 sm:border-t-0 sm:pt-0 sm:pl-4">
            <div className="text-[11px] text-slate-500 sm:text-xs">Grand total</div>
            <div
              className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900 sm:text-xl"
              title="Does not include Customer Charges (In-House)."
            >
              ${formatCurrency(summary.totals.grandTotal)}
            </div>
          </div>
        </div>
        <div className="mt-3 border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={() => setCustomerAccountsFuelNetExpanded(!customerAccountsFuelNetExpanded)}
            className="flex w-full items-center justify-between text-left text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <span>Fleet, vouchers &amp; fuel net</span>
            <span className="text-slate-400">{customerAccountsFuelNetExpanded ? '−' : '+'}</span>
          </button>
          {customerAccountsFuelNetExpanded ? (
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between gap-3">
                <span>Fleet</span>
                <span className="tabular-nums font-medium text-gray-900">
                  ${formatCurrency(summary.totals.fleet)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Vouchers / coupons</span>
                <span className="tabular-nums font-medium text-gray-900">
                  ${formatCurrency(summary.totals.vouchers)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Customer charges (not cash)</span>
                <span className="tabular-nums font-medium text-gray-900">
                  ${formatCurrency(summary.totals.inhouse)}
                </span>
              </div>
              {fuelExpense !== null ? (
                <div className="flex justify-between gap-3 border-t border-gray-100 pt-2">
                  <span>Fuel net</span>
                  <span
                    className={`tabular-nums font-semibold ${
                      summary.totals.grandTotal - fuelExpense >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {summary.totals.grandTotal - fuelExpense >= 0 ? '+' : ''}
                    ${formatCurrency(summary.totals.grandTotal - fuelExpense)}
                  </span>
                </div>
              ) : (
                <p className="text-slate-400">Fuel net appears after a paid fuel batch this month.</p>
              )}
            </div>
          ) : null}
        </div>
        {lastUpdatedLabel ? (
          <p className="mt-3 text-[11px] text-slate-400">{lastUpdatedLabel}</p>
        ) : null}
      </div>
    )
  }

  const renderFuelMtdDepositBlock = () => {
    if (!summary) return null
    const showAvg = fuelMtdView === 'avg'
    const fuelVolumeMtd = fuelMtdSold ? fuelMtdSold.totalUnleaded + fuelMtdSold.totalDiesel : 0
    const fuelVolumeAvg = fuelMtdSold ? fuelMtdSold.avgUnleadedPerDay + fuelMtdSold.avgDieselPerDay : 0
    const depositMtd = summary.totals.deposits
    const depositAvg =
      averageDeposit?.avgDepositMTD ??
      (fuelMtdSold && fuelMtdSold.daysInAverage > 0 ? depositMtd / fuelMtdSold.daysInAverage : 0)
    const avgDaysLabel =
      averageDeposit?.daysElapsed != null
        ? `${averageDeposit.daysElapsed} day${averageDeposit.daysElapsed === 1 ? '' : 's'}`
        : fuelMtdSold?.daysInAverage
          ? `${fuelMtdSold.daysInAverage} day${fuelMtdSold.daysInAverage === 1 ? '' : 's'}`
          : null

    return (
      <div className={insightCardClass}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Fuel MTD</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Litres from shift close · {summary.monthName} {summary.year}
            </p>
          </div>
          <div
            className="flex w-fit shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold"
            role="group"
            aria-label="Fuel MTD view"
          >
            <button
              type="button"
              onClick={() => setFuelMtdView('mtd')}
              className={`rounded-md px-2 py-1 transition-colors ${
                !showAvg ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              aria-pressed={!showAvg}
            >
              MTD
            </button>
            <button
              type="button"
              onClick={() => setFuelMtdView('avg')}
              className={`rounded-md px-2 py-1 transition-colors ${
                showAvg ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              aria-pressed={showAvg}
            >
              Avg/day
            </button>
          </div>
        </div>
        {fuelMtdLoadState !== 'done' ? (
          <div className="mt-3 grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="py-2 sm:py-0 sm:pr-4">
              <div className="text-xs text-slate-500">Fuel volume</div>
              <p className="mt-1 text-sm text-slate-400 italic">Loading…</p>
            </div>
            <div className="py-2 sm:py-0 sm:pl-4">
              <div className="text-xs text-slate-500">Deposit</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600">
                ${formatCurrency(summary.totals.deposits)}
              </div>
              <div className="mt-1 text-xs text-slate-400">{showAvg ? 'Avg per day' : 'MTD'}</div>
            </div>
          </div>
        ) : fuelMtdSold?.isFutureMonth ? (
          <p className="mt-6 text-sm text-slate-400 italic">No data for a future month.</p>
        ) : fuelMtdSold ? (
          <>
            <div className="mt-3 grid flex-1 grid-cols-1 divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="py-2 sm:py-0 sm:pr-4">
                <div className="text-xs text-slate-500">Fuel volume</div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">
                  {formatLitres(showAvg ? fuelVolumeAvg : fuelVolumeMtd)} L
                </div>
                <div className="mt-1.5 space-y-0.5 text-xs tabular-nums text-slate-700">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-500">Gas</span>
                    <span className="font-medium">
                      {formatLitres(showAvg ? fuelMtdSold.avgUnleadedPerDay : fuelMtdSold.totalUnleaded)} L
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-500">Diesel</span>
                    <span className="font-medium">
                      {formatLitres(showAvg ? fuelMtdSold.avgDieselPerDay : fuelMtdSold.totalDiesel)} L
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {showAvg ? (avgDaysLabel ? `Avg per day · ${avgDaysLabel}` : 'Avg per day') : 'MTD total'}
                </div>
              </div>
              <div className="py-2 sm:py-0 sm:pl-4">
                <div className="text-xs text-slate-500">Deposit</div>
                {showAvg && averageDeposit && !averageDeposit.lastShiftDate ? (
                  <p className="mt-1 text-sm text-slate-400 italic">
                    {averageDeposit.periodLabel ?? 'No shift closes this month yet.'}
                  </p>
                ) : (
                  <>
                    <div className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600">
                      ${formatCurrency(showAvg ? depositAvg : depositMtd)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {showAvg
                        ? avgDaysLabel
                          ? `Avg per day · through last close (${avgDaysLabel})`
                          : 'Avg per day'
                        : 'MTD'}
                    </div>
                  </>
                )}
              </div>
            </div>
            {lastUpdatedLabel ? (
              <p className="mt-4 text-[11px] text-slate-400">{lastUpdatedLabel}</p>
            ) : null}
          </>
        ) : (
          <p className="mt-6 text-sm text-amber-800">Could not load fuel volumes.</p>
        )}
      </div>
    )
  }

  const WidgetWrapper = ({
    id,
    children,
    className = '',
    contentClassName
  }: {
    id: DashboardWidgetId
    children: React.ReactNode
    className?: string
    /** When set, replaces default flex-1 content shell (e.g. half-width cards). */
    contentClassName?: string
  }) => {
    const idx = reorderableVisibleLayout.indexOf(id)
    const canMoveUp = idx > 0
    const canMoveDown = idx >= 0 && idx < reorderableVisibleLayout.length - 1
    const marginClass = className.includes('mb-') ? '' : 'mb-4'
    return (
      <div className={`flex gap-3 items-start ${marginClass} ${className}`.trim()}>
        <div className={contentClassName ?? 'flex-1 min-w-0'}>
          {children}
        </div>
        <div className="hidden flex-col gap-0.5 flex-shrink-0 pt-2 lg:flex">
          <button
            onClick={() => handleMoveUp(id)}
            disabled={!canMoveUp}
            title="Move up"
            className="w-8 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 text-sm font-medium border border-gray-200"
          >
            ↑
          </button>
          <button
            onClick={() => handleMoveDown(id)}
            disabled={!canMoveDown}
            title="Move down"
            className="w-8 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 text-sm font-medium border border-gray-200"
          >
            ↓
          </button>
        </div>
      </div>
    )
  }

  const upcomingTypeIcon = (type: UpcomingEvent['type']) => {
    const wrap = (bg: string, d: string) => (
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg}`}>
        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={d} />
        </svg>
      </span>
    )
    switch (type) {
      case 'birthday':
        return wrap('bg-violet-500', 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z')
      case 'pay-day':
        return wrap('bg-emerald-500', 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z')
      case 'invoice':
        return wrap('bg-orange-500', 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z')
      case 'contract':
        return wrap('bg-sky-500', 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2')
      default:
        return wrap('bg-slate-500', 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z')
    }
  }

  const renderUpcomingCard = () => (
    <div className={insightCardClass}>
      <div className="mb-3 flex items-center justify-between gap-2 shrink-0">
        <h2 className="text-base font-semibold text-gray-900">Upcoming</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => router.push('/settings/pay-days')}
            className="text-xs text-slate-500 hover:text-indigo-600 font-medium"
            title="Manage pay days"
          >
            Pay Days
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date()
              const y = today.getFullYear()
              const m = String(today.getMonth() + 1).padStart(2, '0')
              const d = String(today.getDate()).padStart(2, '0')
              setPayDayForm({
                date: `${y}-${m}-${d}`,
                notes: ''
              })
              setPayDayModalOpen(true)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-lg font-light leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title="Add pay day"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const today = businessTodayYmd()
              setReminderForm({
                title: '',
                date: today,
                notes: '',
                notifyEmail: true,
                notifyWhatsApp: false,
                notifyDaysBefore: '7,3,1,0',
                recurrenceType: '',
                recurrenceEndDate: ''
              })
              setReminderModalOpen(true)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-lg font-light leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title="Add reminder"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {upcoming.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400 italic">No events in the next 7 days</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(upcomingExpanded ? upcoming : upcoming.slice(0, 3)).map((event, index) => {
              const formatEventDate = (dateStr: string) => {
                const [y, m, d] = dateStr.split('-').map(Number)
                if (!y || !m || !d) return dateStr
                const date = new Date(y, m - 1, d)
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }
              const getDaysText = () => {
                if (event.daysUntil === 0) return 'Today'
                if (event.daysUntil === 1) return 'Tomorrow'
                return `in ${event.daysUntil} days`
              }
              return (
                <div
                  key={`${event.type}-${event.reminderId ?? event.payDayId ?? index}-${event.date}`}
                  className="flex items-center gap-3 py-3 first:pt-1"
                >
                  {upcomingTypeIcon(event.type)}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{event.title}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-medium text-slate-600">{formatEventDate(event.date)}</div>
                    <div className="text-xs text-slate-400">{getDaysText()}</div>
                  </div>
                  {event.type === 'other' && event.reminderId ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('Delete this reminder?')) return
                        try {
                          const res = await fetch(`/api/reminders/${event.reminderId}`, {
                            method: 'DELETE'
                          })
                          if (res.ok) void refreshUpcoming()
                        } catch (err) {
                          console.error('Failed to delete reminder:', err)
                        }
                      }}
                      className="text-slate-300 hover:text-red-600 text-xs p-0.5"
                      title="Delete reminder"
                    >
                      ✕
                    </button>
                  ) : null}
                  {event.type === 'pay-day' && event.payDayId ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('Delete this pay day?')) return
                        try {
                          const res = await fetch(`/api/pay-days/${event.payDayId}`, {
                            method: 'DELETE'
                          })
                          if (res.ok) void refreshUpcoming()
                        } catch (err) {
                          console.error('Failed to delete pay day:', err)
                        }
                      }}
                      className="text-slate-300 hover:text-red-600 text-xs p-0.5"
                      title="Delete pay day"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
        {upcoming.length > 3 ? (
          <button
            type="button"
            onClick={() => setUpcomingExpanded((v) => !v)}
            className="mt-auto pt-3 text-left text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            {upcomingExpanded ? 'Show less' : `View all → (${upcoming.length})`}
          </button>
        ) : null}
      </div>
    </div>
  )

  const formatShiftTimeLabel = (shiftStartTime?: string, shiftName?: string): string => {
    const name = shiftName?.trim()
    if (name && /\d/.test(name) && /[-–]/.test(name)) return name
    if (shiftStartTime && shiftStartTime.trim()) {
      const t = shiftStartTime.trim()
      const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
      if (m) {
        let h = Number(m[1])
        const min = m[2]
        const ap = h >= 12 ? 'PM' : 'AM'
        if (h > 12) h -= 12
        if (h === 0) h = 12
        const startLabel = `${h}:${min} ${ap}`
        if (name && name !== t) return `${startLabel} · ${name}`
        return startLabel
      }
    }
    return name || 'Shift'
  }

  const renderTodayRosterCard = () => (
    <div className={insightCardClass}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Today&apos;s roster</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {todayRoster ? formatTodayDisplay(todayRoster.date) : 'Today'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 shrink-0">
          {canLogCallOut ? (
            <Link
              href={`/time-off?tab=call-outs&date=${encodeURIComponent(todayRoster?.date ?? businessTodayYmd())}`}
              className="text-xs text-teal-700 hover:text-teal-900 font-medium whitespace-nowrap"
            >
              Log call out
            </Link>
          ) : null}
          {todayRoster?.presentAbsenceEnabled ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard/present-absence')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
            >
              Present / Absent
            </button>
          ) : !isStakeholder ? (
            <button
              type="button"
              onClick={() => router.push('/roster')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
            >
              Roster
            </button>
          ) : null}
        </div>
      </div>
      {todayRoster && todayRoster.presentAbsenceEnabled === false ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-snug text-amber-900">
          Scheduled staff are listed below, but <strong>punch-in status is off</strong> until{' '}
          <strong>Present / absent</strong> is enabled.{' '}
          {isStakeholder ? (
            <>Ask an administrator to turn it on under Attendance → Settings.</>
          ) : (
            <>
              Enable it under{' '}
              <Link
                href="/attendance/settings"
                className="font-semibold text-amber-950 underline hover:text-amber-800"
              >
                Attendance settings
              </Link>
              .
            </>
          )}
        </p>
      ) : null}
      <div className="flex-1">
        {todayRoster?.scheduled && todayRoster.scheduled.length > 0 ? (
          (() => {
            const shiftGroups = groupScheduledByShift(todayRoster.scheduled).sort((a, b) => {
              const da = rosterShiftGroupSortMinutes(a.shiftName, todayRoster.scheduled)
              const db = rosterShiftGroupSortMinutes(b.shiftName, todayRoster.scheduled)
              if (da !== db) return da - db
              return a.shiftName.localeCompare(b.shiftName)
            })
            const cols =
              shiftGroups.length >= 3
                ? 'grid-cols-1 sm:grid-cols-3 sm:divide-x'
                : shiftGroups.length === 2
                  ? 'grid-cols-1 sm:grid-cols-2 sm:divide-x'
                  : 'grid-cols-1'
            return (
              <div className={`grid ${cols} divide-y divide-gray-200 sm:divide-y-0`}>
                {shiftGroups.map((group, i) => {
                  const rowForHeader =
                    todayRoster.scheduled.find(
                      (s) => s.shiftName === group.shiftName && s.shiftStartTime
                    ) ?? todayRoster.scheduled.find((s) => s.shiftName === group.shiftName)
                  const headerLabel = formatShiftTimeLabel(rowForHeader?.shiftStartTime, group.shiftName)
                  return (
                    <div
                      key={group.shiftName}
                      className={`py-3 sm:py-0 ${i === 0 ? 'sm:pr-5' : i === shiftGroups.length - 1 ? 'sm:pl-5' : 'sm:px-5'}`}
                    >
                      <div className="text-xs font-medium text-slate-500">{headerLabel}</div>
                      <div className="mt-2 space-y-1.5">
                        {group.entries.map((e) => {
                          const g = e.presence ? presenceStatusGlyph(e.presence.status) : null
                          const canEditPresence =
                            todayRoster.presentAbsenceEnabled && !isStakeholder && e.presence
                          return (
                            <div
                              key={`${group.shiftName}-${e.staffId}`}
                              className="flex items-center gap-2 text-sm text-gray-800"
                            >
                              {g ? (
                                <button
                                  type="button"
                                  title={g.title}
                                  disabled={!canEditPresence}
                                  onClick={() => {
                                    if (!canEditPresence || !todayRoster.date) return
                                    setPresenceModal({
                                      staffId: e.staffId,
                                      staffName: e.displayName,
                                      date: todayRoster.date,
                                      manualPresent: e.presence?.manualPresent === true,
                                      manualAbsent: e.presence?.manualAbsent === true,
                                      punchExempt: e.presence?.punchExempt === true,
                                      lateReason: e.presence?.lateReason ?? ''
                                    })
                                  }}
                                  className={`h-4 w-4 shrink-0 text-center text-[11px] font-bold leading-none ${
                                    g.className
                                  } ${canEditPresence ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                >
                                  {g.char}
                                </button>
                              ) : (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                              )}
                              <span className="truncate">{e.displayName}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()
        ) : (
          <p className="text-sm text-slate-400 italic">No one scheduled.</p>
        )}
      </div>
      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Who&apos;s off</div>
        {todayRoster?.off && todayRoster.off.length > 0 ? (
          <p className="mt-1 text-xs text-slate-600">
            {todayRoster.off.map((s) => s.staffFirstName ?? s.staffName).join(' · ')}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-400 italic">No one off today.</p>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gray-50 px-4 py-8 sm:min-h-screen sm:p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  const dashboardScopeHint = summary
    ? `Monthly totals for ${summary.monthName} ${summary.year} · Roster and upcoming = today · Fuel chart = last 5 days`
    : 'Select a month to load summary data'

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-blue-950 sm:text-3xl">Home</h1>
          <p className="mt-1 hidden text-sm text-slate-500 sm:block">
            Shortcuts stay on top. Dashboard insights stay below.
          </p>
        </div>
        <HomeShortcutStrip />

        <DashboardSectionLabel>Dashboard</DashboardSectionLabel>
        <div className="mb-3 space-y-2">
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          <button
            onClick={() => {
              setActiveFilter('currentMonth')
              setCustomStartDate('')
              setCustomEndDate('')
              setShowCustomPicker(false)
            }}
            className={`min-h-[44px] rounded px-2 py-2 text-xs font-semibold transition-colors sm:px-3 sm:py-1.5 ${
              activeFilter === 'currentMonth'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Current Month
          </button>
          <button
            onClick={() => {
              setActiveFilter('previousMonth')
              setCustomStartDate('')
              setCustomEndDate('')
              setShowCustomPicker(false)
            }}
            className={`min-h-[44px] rounded px-2 py-2 text-xs font-semibold transition-colors sm:px-3 sm:py-1.5 ${
              activeFilter === 'previousMonth'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Previous Month
          </button>
          <div className="relative">
            <button
              onClick={() => {
                setActiveFilter('custom')
                setShowCustomPicker(!showCustomPicker)
              }}
              className={`min-h-[44px] w-full rounded px-2 py-2 text-xs font-semibold transition-colors sm:w-auto sm:px-3 sm:py-1.5 ${
                activeFilter === 'custom'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Custom{' '}
              {activeFilter === 'custom' && customStartDate ? `(${customStartDate})` : '▼'}
            </button>
            {showCustomPicker && (
              <div
                ref={customPickerRef}
                className="absolute top-full right-0 z-50 mt-2 min-w-[280px] rounded-lg border border-gray-300 bg-white p-4 shadow-xl sm:left-0 sm:right-auto"
              >
                <div className="mb-2 text-sm font-semibold text-gray-700">Select Month</div>
                <input
                  type="month"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {activeFilter !== 'currentMonth' && summary ? (
            <span className="text-xs text-gray-600">
              Showing: {summary.monthName} {summary.year}
            </span>
          ) : null}
          <span className="hidden text-xs text-slate-500 md:inline">{dashboardScopeHint}</span>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          {summary ? renderThisMonthCard() : null}
          {showFuelMtdHero ? renderFuelMtdDepositBlock() : null}
          {renderTodayRosterCard()}
          {renderUpcomingCard()}
        </div>

        {showRecentFuelPaymentHero ? (
          <div className="mb-6">{renderRecentFuelPaymentCard()}</div>
        ) : null}

        {/* Moveable widgets */}
        {(() => {
          let lastSection: 'month' | 'trends' | 'ops' | null = null
          return dashboardSegments.map((segment) => {
          const headId = segment[0]
          if (headId === 'month-summary' && segment.length === 1) {
            lastSection = 'month'
            return <Fragment key="month-summary-hero" />
          }
          let sectionLabel: React.ReactNode = null
          if (headId === 'customer-ar-glance') {
            sectionLabel = <DashboardSectionLabel>Customer accounts</DashboardSectionLabel>
            lastSection = 'month'
          } else if (headId === 'phase1-status' && lastSection !== 'ops') {
            sectionLabel = <DashboardSectionLabel>Operations</DashboardSectionLabel>
            lastSection = 'ops'
          } else if (
            (TRENDS_WIDGET_IDS as readonly string[]).includes(headId) &&
            lastSection !== 'trends'
          ) {
            sectionLabel = <DashboardSectionLabel>Trends</DashboardSectionLabel>
            lastSection = 'trends'
          }
          const renderOne = (id: DashboardWidgetId) => (
            <>
            {id === 'customer-ar-glance' && summary && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 sm:p-6 w-full min-w-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-blue-950 tracking-tight">
                Customer accounts — {summary.monthName} {summary.year}
              </h2>
              <p className="text-sm text-slate-500 mt-1 leading-snug">
                Totals and collections at a glance. Hover charge and payment amounts for
                change since the last import.
              </p>
            </div>

            {arSummary ? (
              (() => {
                const computedClosing =
                  arSummary.opening + arSummary.charges - arSummary.payments
                const posClosing = arSummary.closing
                const reconciled =
                  posClosing == null || Math.abs(posClosing - computedClosing) < 0.01
                const monthKey = monthKeyFromSummary(summary.year, summary.month)
                const { startDate, endDate } = monthDateRangeFromKey(monthKey)
                const collections = staleArAccounts?.buckets.days30
                const staleCount = collections?.count ?? 0
                const staleTotal = collections?.totalBalance ?? 0
                const trackedWithBalance = staleArAccounts?.trackedAccounts ?? 0

                return (
                  <div className="space-y-5">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Total A/R (closing)
                      </div>
                      <div className="mt-1 text-3xl font-bold text-blue-950 tabular-nums">
                        ${formatCurrency(computedClosing)}
                      </div>
                      <p className="mt-2 text-sm text-slate-600 tabular-nums">
                        This month{' '}
                        <span
                          className="font-medium text-blue-950 cursor-help"
                          title={customerArDeltaTitle(
                            'Charges',
                            arSummary.charges,
                            arSummary.chargesPrevious
                          )}
                        >
                          +${formatCurrency(arSummary.charges)} charges
                        </span>
                        {' · '}
                        <span
                          className="font-medium text-blue-950 cursor-help"
                          title={customerArDeltaTitle(
                            'Payments',
                            arSummary.payments,
                            arSummary.paymentsPrevious
                          )}
                        >
                          −${formatCurrency(arSummary.payments)} payments
                        </span>
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                        {reconciled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-800 border border-green-200 font-medium">
                            Reconciled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                            POS differs
                          </span>
                        )}
                        <span className="text-slate-500 tabular-nums">
                          Opening ${formatCurrency(arSummary.opening)}
                        </span>
                        {arSummary.updatedAt && (
                          <span className="text-slate-400">
                            Last import {formatDateTime(arSummary.updatedAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {isFullAccess && staleArAccounts && trackedWithBalance > 0 && (
                      <div className="rounded-lg border border-amber-200/80 bg-amber-50/30 px-4 py-3">
                        {staleCount === 0 ? (
                          <p className="text-sm font-medium text-emerald-800">
                            All tracked accounts paid within 30 days.
                          </p>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                              <h3 className="text-sm font-semibold text-amber-950">
                                Collections — 30+ days
                              </h3>
                              <p className="text-xs text-amber-900 tabular-nums">
                                {staleCount} account{staleCount === 1 ? '' : 's'} · $
                                {formatCurrency(staleTotal)} overdue
                              </p>
                            </div>
                            <div className="divide-y divide-amber-100/80 rounded-md border border-amber-100 bg-white/70">
                              {topStaleAccounts.map((row) => {
                                const status = staleAccountStatus(row)
                                return (
                                  <button
                                    key={row.account}
                                    type="button"
                                    onClick={() =>
                                      router.push(`/customer-accounts?month=${monthKey}`)
                                    }
                                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-amber-50/80 transition-colors first:rounded-t-md last:rounded-b-md"
                                  >
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-slate-900 truncate">
                                        {row.account}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div className="text-sm font-semibold text-slate-900 tabular-nums">
                                        ${formatCurrency(row.balance)}
                                      </div>
                                      <div
                                        className={`text-xs font-medium mt-0.5 ${status.className}`}
                                      >
                                        {status.text}
                                      </div>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                            {staleCount > topStaleAccounts.length && (
                              <p className="mt-2 text-xs text-slate-500">
                                +{staleCount - topStaleAccounts.length} more on Customer
                                Accounts
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {!isStakeholder && !isSupervisorLike && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/customer-accounts?month=${monthKey}`)
                          }
                          className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold text-sm hover:bg-indigo-700"
                        >
                          Open Customer Accounts
                        </button>
                        <Link
                          href={`/customer-accounts/statement?startDate=${startDate}&endDate=${endDate}&mode=summary`}
                          className="px-4 py-2 bg-white text-gray-800 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-50"
                        >
                          Account Statement
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })()
            ) : !isStakeholder && !isSupervisorLike ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center">
                <p className="text-sm text-slate-600">
                  No customer A/R data for {summary.monthName} {summary.year}.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/customer-accounts')}
                  className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Import on Customer Accounts →
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Customer A/R is not shown for your role.</p>
            )}
          </div>
            )}
            {id === 'average-deposit' && summary && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 sm:p-6 w-full min-w-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-blue-950">Average deposit</h2>
              <p className="text-sm text-slate-500 mt-1 leading-snug">
                From shift close deposits, month-to-date through the <strong>last shift close</strong> (not
                necessarily today). Compared to the same calendar day last month and last year.
              </p>
              {averageDeposit?.lastShiftDate && averageDeposit.periodLabel && (
                <p className="mt-2 text-xs font-medium text-slate-500">{averageDeposit.periodLabel}</p>
              )}
            </div>
            {averageDeposit ? (
              averageDeposit.lastShiftDate ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2">
                    <span className="text-sm font-medium text-slate-700">This month (MTD)</span>
                    <span className="text-lg font-bold text-blue-950 tabular-nums">
                      ${formatCurrency(averageDeposit.avgDepositMTD)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2">
                    <span className="text-sm font-medium text-slate-700">
                      Same day last month
                      {averageDeposit.sameDayLastMonth && (
                        <span className="text-slate-500 font-normal ml-1">
                          ({new Date(averageDeposit.sameDayLastMonth.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-semibold text-blue-950 tabular-nums">
                      {averageDeposit.sameDayLastMonth != null ? `$${formatCurrency(averageDeposit.sameDayLastMonth.total)}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm font-medium text-slate-700">
                      Same day last year
                      {averageDeposit.sameDayLastYear && (
                        <span className="text-slate-500 font-normal ml-1">
                          ({new Date(averageDeposit.sameDayLastYear.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-semibold text-blue-950 tabular-nums">
                      {averageDeposit.sameDayLastYear != null ? `$${formatCurrency(averageDeposit.sameDayLastYear.total)}` : '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 mt-1">
                  {averageDeposit.periodLabel ?? 'No shift closes recorded this month yet.'}
                </p>
              )
            ) : (
              <p className="text-sm text-slate-400 italic">No deposit data available</p>
            )}
          </div>
            )}
            {id === 'phase1-status' && summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Cashbook Income/Expense */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-600">Cashbook (MTD)</div>
                <button
                  onClick={() => router.push('/financial/cashbook')}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                  title="View Cashbook"
                >
                  View →
                </button>
              </div>
              {cashbookSummary ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Income</span>
                    <span className="font-semibold text-green-600">
                      ${formatCurrency(cashbookSummary.totalIncome)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Expenses</span>
                    <span className="font-semibold text-red-600">
                      ${formatCurrency(cashbookSummary.totalExpense)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-700">Net</span>
                    <span
                      className={`text-sm font-bold ${
                        cashbookSummary.netIncome >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {cashbookSummary.netIncome >= 0 ? '+' : ''}
                      ${formatCurrency(cashbookSummary.netIncome)}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {cashbookSummary.entryCount} entries
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400">
                  <button
                    onClick={() => router.push('/financial/cashbook')}
                    className="text-amber-600 hover:underline"
                  >
                    Add entries
                  </button>{' '}
                  to track income/expenses
                </div>
              )}
            </div>
            {/* Last Shift Recorded */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-xs font-medium text-gray-600 mb-2">Last Shift Recorded</div>
              {summary.status.lastShift ? (
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {summary.status.lastShift.date} ({summary.status.lastShift.shift})
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatDateTime(summary.status.lastShift.createdAt)}
                  </div>
                </div>
              ) : (
                <div className="text-lg font-semibold text-gray-400">No shifts recorded</div>
              )}
            </div>

            {/* Shifts Pending Review */}
            <div
              className={`bg-white rounded-lg shadow-sm border p-4 ${
                summary.status.pendingReviewCount > 0
                  ? 'border-amber-300 ring-1 ring-amber-100 md:col-span-2'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-600">Shifts Pending Review</div>
                {summary.status.pendingReviewCount > 0 && (
                  <button
                    type="button"
                    onClick={() => router.push('/shifts')}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                  >
                    Review →
                  </button>
                )}
              </div>
              <div className={`text-3xl font-bold ${summary.status.pendingReviewCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {summary.status.pendingReviewCount}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {summary.status.pendingReviewCount === 0
                  ? 'All shifts reviewed'
                  : 'Need O/S reviewed + notes, or legit as-is'}
              </div>
            </div>

            {/* Incomplete Days */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-xs font-medium text-gray-600 mb-2">Incomplete Days</div>
              <div className={`text-3xl font-bold ${summary.status.incompleteDaysCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {summary.status.incompleteDaysCount}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {summary.status.incompleteDaysCount === 0 
                  ? 'All days complete' 
                  : 'Missing shifts'}
              </div>
            </div>

            {/* Over/Short Trend */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-xs font-medium text-gray-600 mb-2">Over/Short (MTD)</div>
              <div className={`text-2xl font-bold ${summary.status.totalOverShort > 0 ? 'text-green-600' : summary.status.totalOverShort < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {summary.status.totalOverShort >= 0 ? '+' : ''}{formatCurrency(summary.status.totalOverShort)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {summary.status.totalOverShort === 0 
                  ? 'Balanced' 
                  : summary.status.totalOverShort > 0 
                    ? 'Over' 
                    : 'Short'}
              </div>
            </div>
          </div>
        )}
            {id === 'fuel-volume' && fuelComparison.length > 0 && (() => {
          const allVals = fuelComparison.flatMap(d => [d.unleaded, d.diesel, d.prevUnleaded, d.prevDiesel])
          const maxVal = Math.max(...allVals, 1)
          const BAR_HEIGHT_PX = 128
          const px = (v: number) => `${Math.round((v / maxVal) * BAR_HEIGHT_PX)}px`
          const shortDate = (d: string) => {
            const dt = new Date(d + 'T12:00:00')
            return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          }
          return (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-700">Fuel Volume — Last 5 Days</h3>
                    <span className="text-xs text-gray-400">vs. same day prior year</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500"/><span>Unleaded</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-800"/><span>Diesel</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-200 border border-green-300"/><span>Prior yr</span></span>
                  </div>
                </div>
                <div className="overflow-x-auto pb-1 -mx-1 px-1">
                <div className="flex min-w-[320px] items-end gap-2 h-40 sm:gap-3">
                  {fuelComparison.map((day) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      {/* Bar group */}
                      <div className="w-full flex items-end justify-center gap-0.5 h-32">
                        {/* Unleaded pair */}
                        <div className="flex items-end gap-0.5 flex-1 justify-center">
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-medium text-gray-700 mb-0.5 leading-tight">{day.unleaded > 0 ? `${Math.round(day.unleaded)}L` : ''}</span>
                            <div
                              title={`Unleaded ${shortDate(day.date)}: ${day.unleaded.toFixed(1)}L`}
                              className="w-full max-w-[20px] bg-green-500 rounded-t transition-all cursor-default"
                              style={{ height: px(day.unleaded), minHeight: day.unleaded > 0 ? '2px' : '0' }}
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-medium text-gray-500 mb-0.5 leading-tight">{day.prevUnleaded > 0 ? `${Math.round(day.prevUnleaded)}L` : ''}</span>
                            <div
                              title={`Unleaded ${shortDate(day.priorDate)} (prior yr): ${day.prevUnleaded.toFixed(1)}L`}
                              className="w-full max-w-[20px] bg-green-200 border border-green-300 rounded-t transition-all cursor-default"
                              style={{ height: px(day.prevUnleaded), minHeight: day.prevUnleaded > 0 ? '2px' : '0' }}
                            />
                          </div>
                        </div>
                        {/* Small gap between fuel types */}
                        <div className="w-1" />
                        {/* Diesel pair */}
                        <div className="flex items-end gap-0.5 flex-1 justify-center">
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-medium text-gray-700 mb-0.5 leading-tight">{day.diesel > 0 ? `${Math.round(day.diesel)}L` : ''}</span>
                            <div
                              title={`Diesel ${shortDate(day.date)}: ${day.diesel.toFixed(1)}L`}
                              className="w-full max-w-[20px] bg-green-800 rounded-t transition-all cursor-default"
                              style={{ height: px(day.diesel), minHeight: day.diesel > 0 ? '2px' : '0' }}
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-medium text-gray-500 mb-0.5 leading-tight">{day.prevDiesel > 0 ? `${Math.round(day.prevDiesel)}L` : ''}</span>
                            <div
                              title={`Diesel ${shortDate(day.priorDate)} (prior yr): ${day.prevDiesel.toFixed(1)}L`}
                              className="w-full max-w-[20px] bg-green-100 border border-green-400 rounded-t transition-all cursor-default"
                              style={{ height: px(day.prevDiesel), minHeight: day.prevDiesel > 0 ? '2px' : '0' }}
                            />
                          </div>
                        </div>
                      </div>
                      {/* Date label */}
                      <div className="text-xs text-gray-500 whitespace-nowrap">{shortDate(day.date)}</div>
                      {/* Totals */}
                      <div className="text-xs text-gray-400 whitespace-nowrap">{(day.unleaded + day.diesel).toFixed(0)}L</div>
                    </div>
                  ))}
                </div>
                </div>
              </div>
          )
        })()}
            {id === 'recent-fuel-payment' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3.5 sm:p-4">
            {recentPayment ? (
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-gray-900">
                  Fuel Payment – {recentPayment.datePaid}
                </h3>
                <div className="text-xs tabular-nums text-gray-800">
                  {recentPayment.invoices.map((inv, idx) => (
                    <div
                      key={`${inv.invoiceNumber}-${idx}`}
                      className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0.5 items-baseline"
                    >
                      <span className="font-mono">{inv.invoiceNumber}</span>
                      <span className="text-right">{inv.amount}</span>
                      <span className="text-right text-gray-600">{inv.type}</span>
                    </div>
                  ))}
                  <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline">
                    <span />
                    <span className="text-right font-semibold text-gray-900">{recentPayment.totalPaid}</span>
                    <span />
                  </div>
                </div>
                <div className="pl-[40%] text-[11px] text-slate-500 space-y-0.5">
                  <div>paid {recentPayment.datePaid}</div>
                  <div>
                    Ref{' '}
                    <span className="font-mono text-blue-600">{recentPayment.referenceNumber}</span>
                  </div>
                </div>
                {(recentPayment.balanceBefore || recentPayment.balanceAfter) && (
                  <div className="pt-1">
                    <div className="text-xs font-semibold text-gray-900">Balance Information</div>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-700 tabular-nums">
                      {recentPayment.balanceBefore ? (
                        <div>Balance Before (Available): {recentPayment.balanceBefore}</div>
                      ) : null}
                      {recentPayment.balanceAfter ? (
                        <div>Balance After (Available – Paid): {recentPayment.balanceAfter}</div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No recent fuel payment recorded</p>
            )}
            {recentPayment && !isStakeholder && (
              <button
                onClick={() => router.push('/fuel-payments/invoices')}
                className="mt-2.5 w-full text-xs text-indigo-600 hover:text-indigo-800 font-medium text-left"
              >
                View All Payments →
              </button>
            )}
          </div>
            )}
            </>
          )
          if (segment.length === 2) {
            return (
              <Fragment key={`dashboard-pair-${segment[0]}-${segment[1]}`}>
                {sectionLabel}
                <div className="flex flex-col lg:flex-row gap-4 mb-4 w-full items-stretch">
                  {segment.map((id) => (
                    <WidgetWrapper
                      key={id}
                      id={id}
                      className="mb-0 flex-1 min-w-0 basis-0 lg:max-w-[calc(50%-0.75rem)]"
                      contentClassName="w-full min-w-0"
                    >
                      {renderOne(id)}
                    </WidgetWrapper>
                  ))}
                </div>
              </Fragment>
            )
          }
          return (
            <Fragment key={segment[0]}>
              {sectionLabel}
              <WidgetWrapper
                id={segment[0]}
                contentClassName={
                  segment[0] === 'customer-ar-glance' ? 'w-full min-w-0' : undefined
                }
              >
                {renderOne(segment[0])}
              </WidgetWrapper>
            </Fragment>
          )
        })
        })()}

      {/* Add Pay Day Modal */}
      {payDayModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setPayDayModalOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Pay Day</h3>
            <p className="text-sm text-gray-600 mb-4">
              Date when accounting will process payments. Reminders sent 3 and 1 days before.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={payDayForm.date}
                  onChange={(e) => setPayDayForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
        </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={payDayForm.notes}
                  onChange={(e) => setPayDayForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. March payroll"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
      </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setPayDayModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!payDayForm.date.trim()) {
                    alert('Date is required.')
                    return
                  }
                  setPayDaySaving(true)
                  try {
                    const res = await fetch('/api/pay-days', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        date: payDayForm.date,
                        notes: payDayForm.notes.trim() || undefined
                      })
                    })
                    if (res.ok) {
                      setPayDayModalOpen(false)
                      setPayDayForm({ date: '', notes: '' })
                      void refreshUpcoming()
                    } else {
                      const err = await res.json().catch(() => ({}))
                      alert(err.error || 'Failed to add pay day')
                    }
                  } finally {
                    setPayDaySaving(false)
                  }
                }}
                disabled={payDaySaving || !payDayForm.date.trim()}
                className="px-4 py-2 bg-amber-600 text-white rounded font-semibold hover:bg-amber-700 disabled:opacity-50"
              >
                {payDaySaving ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {presenceModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setPresenceModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Attendance</h3>
            <p className="text-sm text-gray-600 mb-4">
              {presenceModal.staffName} · {formatTodayDisplay(presenceModal.date)}
            </p>
            <div className="space-y-4">
              {presenceModal.punchExempt ? (
                <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Punch exempt: counted as present without a clock-in. Use absent below if they did not work this day.
                </p>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={presenceModal.manualPresent}
                    onChange={(e) =>
                      setPresenceModal((m) => (m ? { ...m, manualPresent: e.target.checked } : m))
                    }
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-800">Mark present manually</span>
                </label>
              )}
              {presenceModal.punchExempt ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={presenceModal.manualAbsent}
                    onChange={(e) =>
                      setPresenceModal((m) =>
                        m ? { ...m, manualAbsent: e.target.checked, manualPresent: false } : m
                      )
                    }
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-800">Absent for this day</span>
                </label>
              ) : null}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Late / absence note (optional)
                </label>
                <textarea
                  value={presenceModal.lateReason}
                  onChange={(e) =>
                    setPresenceModal((m) => (m ? { ...m, lateReason: e.target.value } : m))
                  }
                  rows={3}
                  placeholder="Reason or context"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPresenceModal(null)}
                className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={presenceSaving}
                onClick={async () => {
                  setPresenceSaving(true)
                  try {
                    const res = await fetch('/api/attendance/present-absence/override', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        staffId: presenceModal.staffId,
                        date: presenceModal.date,
                        manualPresent: presenceModal.punchExempt ? false : presenceModal.manualPresent,
                        manualAbsent: presenceModal.punchExempt ? presenceModal.manualAbsent : false,
                        lateReason: presenceModal.lateReason
                      })
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) {
                      throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save')
                    }
                    setPresenceModal(null)
                    await refreshTodayRoster()
                  } catch (err) {
                    console.error(err)
                    alert(err instanceof Error ? err.message : 'Failed to save')
                  } finally {
                    setPresenceSaving(false)
                  }
                }}
                className="px-4 py-2 bg-slate-700 text-white rounded font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {presenceSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Reminder Modal */}
      {reminderModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setReminderModalOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Reminder</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={reminderForm.title}
                  onChange={(e) => setReminderForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. License renewal"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={reminderForm.date}
                  onChange={(e) => setReminderForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repeat</label>
                <div className="flex flex-wrap items-center gap-2">
                  <IconSelect<ReminderRecurrence>
                    ariaLabel="Reminder repeat frequency"
                    value={reminderForm.recurrenceType}
                    onChange={(v) => setReminderForm((f) => ({ ...f, recurrenceType: v }))}
                    options={REMINDER_RECURRENCE_OPTIONS}
                    renderTrigger={() => <IconRepeat />}
                  />
                  <span className="text-sm text-gray-600" title="Current choice">
                    {REMINDER_RECURRENCE_OPTIONS.find((o) => o.value === reminderForm.recurrenceType)?.label ??
                      'One-time'}
                  </span>
                </div>
                {reminderForm.recurrenceType && (
                  <div className="mt-2">
                    <label className="block text-xs text-gray-500 mb-1">End date (optional)</label>
                    <input
                      type="date"
                      value={reminderForm.recurrenceEndDate}
                      onChange={(e) => setReminderForm((f) => ({ ...f, recurrenceEndDate: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={reminderForm.notes}
                  onChange={(e) => setReminderForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional details"
                  rows={2}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notify</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reminderForm.notifyEmail}
                      onChange={(e) => setReminderForm((f) => ({ ...f, notifyEmail: e.target.checked }))}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Email</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reminderForm.notifyWhatsApp}
                      onChange={(e) => setReminderForm((f) => ({ ...f, notifyWhatsApp: e.target.checked }))}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">WhatsApp</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={reminderForm.notifyDaysBefore}
                      onChange={(e) => setReminderForm((f) => ({ ...f, notifyDaysBefore: e.target.value }))}
                      placeholder="7,3,1,0"
                      className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                    <span className="text-xs text-gray-500">days before</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setReminderModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!reminderForm.title.trim()) {
                    alert('Title is required.')
                    return
                  }
                  if (!reminderForm.date.trim()) {
                    alert('Date is required.')
                    return
                  }
                  try {
                    const res = await fetch('/api/reminders', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: reminderForm.title.trim(),
                        date: reminderForm.date.trim(),
                        notes: reminderForm.notes.trim() || null,
                        notifyEmail: reminderForm.notifyEmail,
                        notifyWhatsApp: reminderForm.notifyWhatsApp,
                        notifyDaysBefore: reminderForm.notifyDaysBefore,
                        recurrenceType: reminderForm.recurrenceType || null,
                        recurrenceEndDate: reminderForm.recurrenceEndDate.trim() || null
                      })
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) {
                      throw new Error((data as { error?: string }).error || `Failed to create (${res.status})`)
                    }
                    setReminderModalOpen(false)
                    void refreshUpcoming()
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Failed to create reminder')
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

