'use client'

import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
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
import { useAuth } from '@/app/components/AuthContext'
import { IconRepeat, IconSelect } from '@/app/components/IconDropdown'

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
  }[]
  datePaid: string
  referenceNumber: string
  totalPaid: string
  availableBalance: string
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

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading: authLoading, isStakeholder, isSupervisorLike } = useAuth()
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
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<MonthFilterType>('currentMonth')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const customPickerRef = useRef<HTMLDivElement>(null)
  const fuelMtdReqId = useRef(0)
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

  useEffect(() => {
    if (authLoading) return
    void fetchSummary()
    void fetchUpcoming()
    void fetchRecentPayment()
  }, [activeFilter, customStartDate, customEndDate, authLoading])

  const refreshTodayRoster = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/today')
      if (res.ok) {
        const data = await res.json()
        setTodayRoster(data)
      }
    } catch (err) {
      console.error('Error fetching today roster:', err)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    void refreshTodayRoster()
  }, [authLoading, refreshTodayRoster])

  /** Roster/presence is not realtime; refetch when the tab becomes visible again after a punch. */
  useEffect(() => {
    if (authLoading) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshTodayRoster()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [authLoading, refreshTodayRoster])

  useEffect(() => {
    if (authLoading || isSupervisorLike) return
    fetch('/api/dashboard/fuel-comparison', { cache: 'no-store', credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setFuelComparison(data) })
      .catch(() => {})
  }, [authLoading, isSupervisorLike])

  useEffect(() => {
    if (authLoading || isSupervisorLike) return
    fetch('/api/dashboard/average-deposit', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.avgDepositMTD === 'number' && !data.error) setAverageDeposit(data)
        else setAverageDeposit(null)
      })
      .catch(() => setAverageDeposit(null))
  }, [authLoading, isSupervisorLike])

  // Fetch A/R summary when summary data changes (respects month filter)
  useEffect(() => {
    if (isStakeholder || isSupervisorLike) {
      setArSummary(null)
      return
    }
    if (summary?.year && summary?.month) {
      fetchArSummary(summary.year, summary.month)
    } else {
      setArSummary(null)
    }
  }, [summary, isStakeholder, isSupervisorLike])

  // Fetch cashbook summary for the displayed month
  useEffect(() => {
    if (isStakeholder || isSupervisorLike) {
      setCashbookSummary(null)
      return
    }
    if (!summary?.year || !summary?.month) {
      setCashbookSummary(null)
      return
    }
    const startDate = `${summary.year}-${String(summary.month).padStart(2, '0')}-01`
    const lastDay = new Date(summary.year, summary.month, 0)
    const endDate = `${summary.year}-${String(summary.month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
    const load = async () => {
      try {
        const res = await fetch(
          `/api/financial/cashbook/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
        )
        if (res.ok) {
          const data = await res.json()
          setCashbookSummary({
            totalIncome: data.totalIncome ?? 0,
            totalExpense: data.totalExpense ?? 0,
            netIncome: data.netIncome ?? 0,
            entryCount: data.entryCount ?? 0
          })
        } else {
          setCashbookSummary(null)
        }
      } catch {
        setCashbookSummary(null)
      }
    }
    void load()
  }, [summary?.year, summary?.month, isStakeholder, isSupervisorLike])

  useEffect(() => {
    if (!summary?.year || !summary?.month) {
      setFuelMtdSold(null)
      setFuelMtdLoadState('idle')
      return
    }
    const rid = ++fuelMtdReqId.current
    setFuelMtdLoadState('loading')
    const params = new URLSearchParams({
      year: String(summary.year),
      month: String(summary.month)
    })
    fetch(`/api/dashboard/fuel-mtd-sold?${params}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        if (rid !== fuelMtdReqId.current) return
        if (!res.ok) {
          setFuelMtdSold(null)
          return
        }
        const data = (await res.json()) as FuelMtdSoldPayload
        if (rid !== fuelMtdReqId.current) return
        if (data && typeof data.avgUnleadedPerDay === 'number') {
          setFuelMtdSold(data)
        } else {
          setFuelMtdSold(null)
        }
      })
      .catch(() => {
        if (rid !== fuelMtdReqId.current) return
        setFuelMtdSold(null)
      })
      .finally(() => {
        if (rid === fuelMtdReqId.current) {
          setFuelMtdLoadState('done')
        }
      })
  }, [summary?.year, summary?.month])

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

  const fetchSummary = async () => {
    setLoading(true)
    try {
      let url = '/api/dashboard/month-summary'
      const range = getMonthRange(activeFilter)
      
      if (range) {
        const params = new URLSearchParams()
          params.append('year', range.year.toString())
          params.append('month', range.month.toString())
        url += `?${params.toString()}`
      }

      const res = await fetch(url)
      if (!res.ok) {
        throw new Error('Failed to fetch summary')
      }
      const data: MonthSummary = await res.json()
      setSummary(data)

      // Keep fuel expense aligned with whatever month the summary resolves to
      if (data?.year && data?.month && !isStakeholder && !isSupervisorLike) {
        try {
          const monthKey = `${data.year}-${String(data.month).padStart(2, '0')}`
          const fuelRes = await fetch(`/api/fuel-payments/monthly?month=${monthKey}`)
          if (fuelRes.ok) {
            const fuelData: FuelExpenseSummary = await fuelRes.json()
            setFuelExpense(fuelData.grandTotal)
          } else {
            setFuelExpense(null)
          }
        } catch (error) {
          console.error('Error fetching monthly fuel expense summary:', error)
          setFuelExpense(null)
        }
      } else {
        setFuelExpense(null)
      }
    } catch (error) {
      console.error('Error fetching dashboard summary:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUpcoming = async () => {
    try {
      const res = await fetch('/api/dashboard/upcoming')
      if (!res.ok) {
        throw new Error('Failed to fetch upcoming events')
      }
      const data = await res.json()
      setUpcoming(data)
    } catch (error) {
      console.error('Error fetching upcoming events:', error)
    }
  }

  const fetchRecentPayment = async () => {
    try {
      const res = await fetch('/api/fuel-payments/recent', { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) {
        throw new Error('Failed to fetch recent fuel payment')
      }
      const data = await res.json()
      setRecentPayment(data)
    } catch (error) {
      console.error('Error fetching recent fuel payment:', error)
    }
  }

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
        return { char: '!', title: 'Late / no punch yet', className: 'text-amber-600' }
      case 'absent':
        return { char: '✗', title: 'Absent', className: 'text-red-600' }
      case 'off':
        return { char: '—', title: 'Not expected today', className: 'text-slate-400' }
      case 'pending':
      default:
        return { char: '…', title: 'Before grace or waiting', className: 'text-slate-400' }
    }
  }

  const fetchArSummary = async (year: number, month: number) => {
    try {
      const res = await fetch(`/api/customer-accounts/monthly?year=${year}&month=${month}`)
      if (!res.ok) {
        throw new Error('Failed to fetch A/R summary')
      }
      const data = await res.json()
      // API returns an array, get the first (and should be only) result
      if (Array.isArray(data) && data.length > 0) {
        setArSummary(data[0])
      } else {
        setArSummary(null)
      }
    } catch (error) {
      console.error('Error fetching A/R summary:', error)
      setArSummary(null)
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

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const visibleLayout = layout.filter(id => id !== 'fuel-volume' || fuelComparison.length > 0)

  /** Widgets that participate in reorder controls and the scrollable list (excludes pinned top). */
  const reorderableVisibleLayout = useMemo(
    () => visibleLayout.filter((id) => !isPinnedTopDashboardWidget(id)),
    [visibleLayout]
  )

  const dashboardSegments = useMemo(
    () => buildDashboardSegments(reorderableVisibleLayout),
    [reorderableVisibleLayout]
  )

  const showFuelMtdHero = visibleLayout.includes('fuel-mtd-deposit-block')

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

  const renderFuelMtdDepositBlock = () => {
    if (!summary) return null
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 sm:p-6 w-full min-w-0">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-blue-950">Fuel sold — daily average (MTD)</h2>
          <p className="text-sm text-slate-500 mt-1 leading-snug">
            Litres from shift close entries for {summary.monthName} {summary.year}. Averages divide total volume
            by calendar days in the period (current month: 1st through today; past months: full month).
          </p>
        </div>
        {fuelMtdLoadState !== 'done' ? (
          <p className="text-sm text-slate-400 italic">Loading fuel volumes…</p>
        ) : fuelMtdSold?.isFutureMonth ? (
          <p className="text-sm text-slate-400 italic">No data for a future month.</p>
        ) : fuelMtdSold ? (
          <div className="space-y-4">
            <p className="text-xs font-medium text-slate-500">{fuelMtdSold.periodLabel}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <div className="mb-1 text-xs font-semibold text-emerald-800">Gas (unleaded)</div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">
                  {formatLitres(fuelMtdSold.avgUnleadedPerDay)} L
                </div>
                <div className="mt-0.5 text-xs font-medium text-emerald-700">per day average</div>
                <div className="mt-3 border-t border-emerald-200/90 pt-2 text-xs font-medium text-slate-700">
                  MTD total: {formatLitres(fuelMtdSold.totalUnleaded)} L
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-1 text-xs font-semibold text-slate-600">Diesel</div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">
                  {formatLitres(fuelMtdSold.avgDieselPerDay)} L
                </div>
                <div className="mt-0.5 text-xs text-slate-500">per day average</div>
                <div className="mt-3 border-t border-slate-200 pt-2 text-xs font-medium text-slate-700">
                  MTD total: {formatLitres(fuelMtdSold.totalDiesel)} L
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-800">
            Could not load fuel volumes. If this persists, check that you are signed in and have access to
            dashboard data.
          </p>
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
    const marginClass = className.includes('mb-') ? '' : 'mb-6'
    return (
      <div className={`flex gap-3 items-start ${marginClass} ${className}`.trim()}>
        <div className={contentClassName ?? 'flex-1 min-w-0'}>
          {children}
        </div>
        <div className="flex flex-col gap-0.5 flex-shrink-0 pt-2">
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

  const renderUpcomingCard = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-full min-h-[7.5rem] flex flex-col w-full min-w-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-bold text-gray-900">Upcoming</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => router.push('/settings/pay-days')}
            className="text-xs text-gray-500 hover:text-indigo-600 font-medium"
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
            className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-100 hover:bg-amber-200 text-amber-700 text-lg font-light leading-none"
            title="Add pay day"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date()
              setReminderForm({
                title: '',
                date: today.toISOString().slice(0, 10),
                notes: '',
                notifyEmail: true,
                notifyWhatsApp: false,
                notifyDaysBefore: '7,3,1,0',
                recurrenceType: '',
                recurrenceEndDate: ''
              })
              setReminderModalOpen(true)
            }}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 hover:text-gray-800 text-lg font-light leading-none"
            title="Add reminder"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {upcoming.length === 0 ? (
          <p className="text-gray-400 text-xs italic text-center py-3">No events in next 7 days</p>
        ) : (
          <div className="space-y-2">
            {upcoming.slice(0, 3).map((event, index) => {
              const getIcon = () => {
                switch (event.type) {
                  case 'birthday':
                    return '🎂'
                  case 'invoice':
                    return '📄'
                  case 'contract':
                    return '📋'
                  case 'pay-day':
                    return '💰'
                  default:
                    return '📅'
                }
              }
              const getPriorityColor = () => {
                switch (event.priority) {
                  case 'high':
                    return 'border-l-2 border-red-400 bg-red-50'
                  case 'medium':
                    return 'border-l-2 border-yellow-400 bg-yellow-50'
                  default:
                    return 'border-l-2 border-blue-400 bg-blue-50'
                }
              }
              const formatEventDate = (dateStr: string) => {
                const [y, m, d] = dateStr.split('-').map(Number)
                if (!y || !m || !d) return dateStr
                const date = new Date(y, m - 1, d)
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }
              const getDaysText = () => {
                if (event.daysUntil === 0) return 'Today'
                if (event.daysUntil === 1) return 'Tomorrow'
                return `${event.daysUntil}d`
              }

              return (
                <div
                  key={`${event.type}-${event.reminderId ?? event.payDayId ?? index}-${event.date}`}
                  className={`rounded p-2 ${getPriorityColor()}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-lg flex-shrink-0">{getIcon()}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-gray-900 truncate">{event.title}</div>
                        <div className="text-xs text-gray-500">{formatEventDate(event.date)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="text-xs font-semibold text-gray-700">{getDaysText()}</div>
                      {event.type === 'other' && event.reminderId && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm('Delete this reminder?')) return
                            try {
                              const res = await fetch(`/api/reminders/${event.reminderId}`, {
                                method: 'DELETE'
                              })
                              if (res.ok) fetchUpcoming()
                            } catch (err) {
                              console.error('Failed to delete reminder:', err)
                            }
                          }}
                          className="text-gray-400 hover:text-red-600 text-xs p-0.5"
                          title="Delete reminder"
                        >
                          ✕
                        </button>
                      )}
                      {event.type === 'pay-day' && event.payDayId && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm('Delete this pay day?')) return
                            try {
                              const res = await fetch(`/api/pay-days/${event.payDayId}`, {
                                method: 'DELETE'
                              })
                              if (res.ok) fetchUpcoming()
                            } catch (err) {
                              console.error('Failed to delete pay day:', err)
                            }
                          }}
                          className="text-gray-400 hover:text-red-600 text-xs p-0.5"
                          title="Delete pay day"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {upcoming.length > 3 && (
              <p className="text-xs text-gray-400 text-center pt-1">+{upcoming.length - 3} more</p>
            )}
          </div>
        )}
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 w-full min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-base font-bold text-gray-900">
          {todayRoster ? formatTodayDisplay(todayRoster.date) : 'Today'}
        </h3>
        <div className="flex items-center justify-end shrink-0">
          {todayRoster?.presentAbsenceEnabled ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard/present-absence')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Present / Absent Roster →
            </button>
          ) : !isStakeholder ? (
            <button
              type="button"
              onClick={() => router.push('/roster')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Roster →
            </button>
          ) : null}
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Scheduled</div>
          {todayRoster?.scheduled && todayRoster.scheduled.length > 0 ? (
            <div className="flex flex-col gap-4">
              {groupScheduledByShift(todayRoster.scheduled).map((group) => {
                const rowForHeader =
                  todayRoster.scheduled.find(
                    (s) => s.shiftName === group.shiftName && s.shiftStartTime
                  ) ?? todayRoster.scheduled.find((s) => s.shiftName === group.shiftName)
                const headerLabel = formatShiftTimeLabel(rowForHeader?.shiftStartTime, group.shiftName)
                return (
                  <div key={group.shiftName} className="text-xs">
                    <div className="inline-flex items-center gap-1.5 font-semibold text-gray-900">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: group.color || '#7c3aed' }}
                        title={group.shiftName}
                      />
                      <span>{headerLabel}</span>
                    </div>
                    <div className="mt-1.5 text-gray-800 space-y-0.5 pl-3 border-l border-slate-100 ml-1">
                      {group.entries.map((e) => {
                        const g = e.presence ? presenceStatusGlyph(e.presence.status) : null
                        const canEditPresence =
                          todayRoster.presentAbsenceEnabled && !isStakeholder && e.presence
                        return (
                          <div
                            key={`${group.shiftName}-${e.staffId}`}
                            className="flex items-center gap-1.5 min-h-[1.25rem]"
                          >
                            {g && (
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
                                className={`w-5 shrink-0 text-center font-bold leading-none tabular-nums ${
                                  g.className
                                } ${canEditPresence ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                              >
                                {g.char}
                              </button>
                            )}
                            <span>{e.displayName}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">No one scheduled.</p>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Who&apos;s off</div>
          {todayRoster?.off && todayRoster.off.length > 0 ? (
            <div className="text-xs text-gray-700 leading-snug flex flex-wrap items-baseline gap-y-1">
              {todayRoster.off.map((s, i) => (
                <span key={s.staffId} className="inline-flex min-w-0 max-w-full items-baseline">
                  {i > 0 ? (
                    <span className="mx-1.5 shrink-0 text-slate-300 select-none" aria-hidden>
                      |
                    </span>
                  ) : null}
                  <span className="break-words">{s.staffFirstName ?? s.staffName}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">No one off today.</p>
          )}
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-blue-950 tracking-tight">Dashboard</h1>
        </div>

        {/* Wide metrics + narrow operations (matches dashboard mockup) */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
          <div className="lg:col-span-8 space-y-6 min-w-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setActiveFilter('currentMonth')
                setCustomStartDate('')
                setCustomEndDate('')
                setShowCustomPicker(false)
              }}
              className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                activeFilter === 'currentMonth'
                  ? 'bg-blue-600 text-white'
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
              className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                activeFilter === 'previousMonth'
                  ? 'bg-blue-600 text-white'
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
                className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                  activeFilter === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Custom{' '}
                {activeFilter === 'custom' && customStartDate
                  ? `(${customStartDate})`
                  : '▼'}
              </button>
              {showCustomPicker && (
                <div ref={customPickerRef} className="absolute top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-xl z-50 p-4 min-w-[280px]">
                  <div className="mb-2 text-sm font-semibold text-gray-700">
                    Select Month
                  </div>
                  <div className="flex flex-col gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Month
                      </label>
                      <input
                        type="month"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            {activeFilter !== 'currentMonth' && summary && (
              <span className="text-sm text-gray-600 ml-2">
                Showing: {summary.monthName} {summary.year}
              </span>
            )}
          </div>
            </div>
            {showFuelMtdHero && summary ? renderFuelMtdDepositBlock() : null}
          </div>
          <aside className="lg:col-span-4 flex flex-col gap-4 w-full min-w-0">
            {renderUpcomingCard()}
            {renderTodayRosterCard()}
          </aside>
        </div>

        {/* Moveable widgets */}
        {dashboardSegments.map((segment) => {
          const renderOne = (id: DashboardWidgetId) => (
            <>
            {id === 'month-summary' && summary && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-700">
                Summary ({summary.monthName} {summary.year})
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {activeFilter === 'currentMonth'
                  ? 'Running totals for the current month'
                  : `Totals for ${summary.monthName} ${summary.year}`}
              </p>
            </div>

            {/* Metrics Grid - cash-style inflows only */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-3">
              {/* Total Deposits */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="text-xs font-medium text-blue-700 mb-1">Total Deposits</div>
                <div className="text-2xl font-bold text-blue-900">
                  ${formatCurrency(summary.totals.deposits)}
                </div>
              </div>

              {/* Total Debit & Credit */}
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="text-xs font-medium text-purple-700 mb-1">Debit & Credit</div>
                <div className="text-2xl font-bold text-purple-900">
                  ${formatCurrency(summary.totals.debitAndCredit)}
                </div>
              </div>

              {/* Total Fleet */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-xs font-medium text-green-700 mb-1">Total Fleet</div>
                <div className="text-2xl font-bold text-green-900">
                  ${formatCurrency(summary.totals.fleet)}
                </div>
              </div>

              {/* Total Vouchers/Coupons */}
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-xs font-medium text-orange-700 mb-1">
                  Vouchers/Coupons
                </div>
                <div className="text-2xl font-bold text-orange-900">
                  ${formatCurrency(summary.totals.vouchers)}
                </div>
              </div>

              {/* Grand Total (cash-style, excludes Customer Charges) */}
              <div className="bg-gray-100 rounded-lg p-4 border-2 border-gray-300 col-span-2 md:col-span-4 lg:col-span-1">
                <div className="text-xs font-medium text-gray-700 mb-1">Grand Total</div>
                <div
                  className="text-2xl font-bold text-gray-900"
                  title="Does not include Customer Charges (In-House)."
                >
                  ${formatCurrency(summary.totals.grandTotal)}
              </div>
            </div>
          </div>

            {/* Customer Accounts + Fuel Net helper band (collapsible) */}
            <div className="mt-2 pt-3 border-t border-dashed border-gray-200">
              <button
                type="button"
                onClick={() => setCustomerAccountsFuelNetExpanded(!customerAccountsFuelNetExpanded)}
                className="w-full flex items-center justify-between gap-2 text-left py-1 -mx-1 px-1 rounded hover:bg-gray-50"
              >
                <span className="text-xs font-semibold text-gray-700">
                  Customer Accounts & Fuel Net
                </span>
                <span className="text-gray-400 text-sm">
                  {customerAccountsFuelNetExpanded ? '▼' : '▶'}
                </span>
              </button>
              {customerAccountsFuelNetExpanded && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-700">
                        Customer Accounts (info only, not cash)
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Customer Charges (MTD):{' '}
                        <span className="font-semibold text-gray-700">
                          ${formatCurrency(summary.totals.inhouse)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Fuel Net (Revenue vs Expense) */}
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-700">
                        Fuel Net (Month-to-Date)
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 max-w-sm">
                        Cash-style Grand Total above minus paid fuel invoices for{' '}
                        {summary.monthName} {summary.year}. Customer Charges (MTD) are
                        shown separately here and are not included in this net.
                      </div>
                    </div>

                    {fuelExpense !== null ? (
                      <div className="text-right text-xs space-y-0.5">
                        <div className="text-gray-600">
                          <span className="font-semibold">Revenue:</span>{' '}
                          ${formatCurrency(summary.totals.grandTotal)}
                        </div>
                        <div className="text-gray-600">
                          <span className="font-semibold">Fuel Expense:</span>{' '}
                          ${formatCurrency(fuelExpense)}
                        </div>
                        <div
                          className={`mt-1 text-sm font-bold ${
                            summary.totals.grandTotal - fuelExpense > 0
                              ? 'text-green-600'
                              : summary.totals.grandTotal - fuelExpense < 0
                              ? 'text-red-600'
                              : 'text-gray-600'
                          }`}
                        >
                          Net:{' '}
                          {summary.totals.grandTotal - fuelExpense >= 0 ? '+' : ''}
                          {formatCurrency(summary.totals.grandTotal - fuelExpense)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">
                        Fuel net will appear once there is at least one paid fuel batch for this
                        month.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
            )}
            {id === 'customer-ar-glance' && summary && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 sm:p-6 w-full">
            <div className="min-w-0 mb-3">
              <h2 className="text-lg font-semibold text-blue-950 tracking-tight">
                Customer accounts
              </h2>
              <p className="text-sm text-slate-500 mt-1 leading-snug">
                Totals for {summary.monthName} {summary.year}. Hover Charges or Payments to see change
                since the last import or save.
              </p>
              {!isStakeholder && !isSupervisorLike && (
                <button
                  type="button"
                  onClick={() => router.push('/customer-accounts')}
                  className="mt-2 text-sm text-teal-600 hover:text-teal-700 font-semibold"
                >
                  Customer Accounts →
                </button>
              )}
            </div>

            {arSummary ? (
              <>
                {(() => {
                  const computedClosing =
                    arSummary.opening + arSummary.charges - arSummary.payments
                  const posClosing = arSummary.closing
                  const posDiffers =
                    posClosing != null && Math.abs(posClosing - computedClosing) >= 0.01
                  return (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div
                        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        <div
                          className="rounded-lg bg-white border border-slate-200 px-4 py-3 cursor-help shadow-sm"
                          title={customerArDeltaTitle(
                            'Charges',
                            arSummary.charges,
                            arSummary.chargesPrevious
                          )}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Charges
                          </div>
                          <div className="mt-1 text-2xl font-bold text-blue-950 tabular-nums break-all sm:break-normal">
                            ${formatCurrency(arSummary.charges)}
                          </div>
                        </div>
                        <div
                          className="rounded-lg bg-white border border-slate-200 px-4 py-3 cursor-help shadow-sm"
                          title={customerArDeltaTitle(
                            'Payments',
                            arSummary.payments,
                            arSummary.paymentsPrevious
                          )}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Payments
                          </div>
                          <div className="mt-1 text-2xl font-bold text-blue-950 tabular-nums break-all sm:break-normal">
                            ${formatCurrency(arSummary.payments)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-600">
                        <div>
                          <span className="text-slate-500">Opening</span>{' '}
                          <span className="tabular-nums font-medium text-blue-950">
                            ${formatCurrency(arSummary.opening)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Closing (computed)</span>{' '}
                          <span className="tabular-nums font-medium text-blue-950">
                            ${formatCurrency(computedClosing)}
                          </span>
                          {posDiffers && (
                            <span className="ml-1 text-amber-700 text-xs font-medium">
                              (POS {formatCurrency(posClosing!)})
                            </span>
                          )}
                        </div>
                      </div>

                      {arSummary.updatedAt && (
                        <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-400">
                          Last updated{' '}
                          <span className="text-slate-500">{formatDateTime(arSummary.updatedAt)}</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            ) : !isStakeholder && !isSupervisorLike ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center">
                <p className="text-sm text-slate-600">
                  No customer A/R data for {summary.monthName} {summary.year}.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/customer-accounts')}
                  className="mt-2 text-xs font-semibold text-teal-600 hover:text-teal-700"
                >
                  Import or enter on Customer Accounts →
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Customer A/R Summary — hidden for stakeholders */}
            {!isStakeholder && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-600">Customer A/R</div>
                <button
                  onClick={() => router.push('/customer-accounts')}
                  className="text-xs text-teal-600 hover:text-teal-700 font-semibold"
                  title="View Customer Accounts"
                >
                  View →
                </button>
              </div>
              {arSummary ? (
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Closing Balance</div>
                    <div className="text-lg font-semibold text-gray-900">
                      ${formatCurrency(arSummary.closing ?? 0)}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Collection Rate</span>
                      <span
                        className={`font-semibold ${
                          arSummary.charges > 0
                            ? arSummary.payments / arSummary.charges >= 1
                              ? 'text-green-600'
                              : arSummary.payments / arSummary.charges >= 0.8
                              ? 'text-yellow-600'
                              : 'text-red-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {arSummary.charges > 0
                          ? `${Math.round((arSummary.payments / arSummary.charges) * 100)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1">
                      <span className="text-gray-500">Reconciled</span>
                      <span
                        className={`font-semibold ${
                          arSummary.closing != null &&
                          Math.abs(
                            (arSummary.opening + arSummary.charges - arSummary.payments) -
                              (arSummary.closing ?? 0)
                          ) < 0.01
                            ? 'text-green-600'
                            : 'text-yellow-600'
                        }`}
                      >
                        {arSummary.closing != null &&
                        Math.abs(
                          (arSummary.opening + arSummary.charges - arSummary.payments) -
                            (arSummary.closing ?? 0)
                        ) < 0.01
                          ? '✓ Yes'
                          : arSummary.closing != null
                          ? '⚠ Check'
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400">
                  No A/R data for {summary.monthName} {summary.year}
                </div>
              )}
            </div>
            )}
            {/* Cashbook Income/Expense */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-600">Cashbook (MTD)</div>
                <button
                  onClick={() => router.push('/financial/cashbook')}
                  className="text-xs text-amber-600 hover:text-amber-700 font-semibold"
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
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-xs font-medium text-gray-600 mb-2">Shifts Pending Review</div>
              <div className={`text-3xl font-bold ${summary.status.pendingReviewCount > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                {summary.status.pendingReviewCount}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {summary.status.pendingReviewCount === 0 
                  ? 'All shifts reviewed' 
                  : 'Need over/short explanation'}
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
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold text-gray-700">Fuel Volume — Last 5 Days</h3>
                    <span className="text-xs text-gray-400">vs. same day prior year</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500"/><span>Unleaded</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-800"/><span>Diesel</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-200 border border-green-300"/><span>Prior yr</span></span>
                  </div>
                </div>
                <div className="flex items-end gap-3 h-40">
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
          )
        })()}
            {id === 'recent-fuel-payment' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Recent Fuel Payment</h3>
              <p className="text-xs text-gray-500 mt-1">Most recent batch of paid fuel invoices</p>
            </div>
            {recentPayment ? (
              <div className="space-y-3">
                {/* Batch summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Date Paid</div>
                    <div className="text-xs text-gray-900">{recentPayment.datePaid}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Reference #</div>
                    <div className="text-xs text-gray-900 font-mono">{recentPayment.referenceNumber}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Total Paid</div>
                    <div className="text-xs text-gray-900 font-semibold">{recentPayment.totalPaid}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Available Balance</div>
                    <div className="text-xs text-green-600 font-semibold">{recentPayment.availableBalance}</div>
                  </div>
                </div>

                {/* Invoices list */}
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">
                    Invoices in this payment ({recentPayment.invoices.length})
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded border border-gray-100 bg-gray-50">
                    {recentPayment.invoices.map((inv, idx) => (
                      <div
                        key={`${inv.invoiceNumber}-${idx}`}
                        className="flex items-center justify-between px-2 py-1 text-xs border-b border-gray-100 last:border-b-0"
                      >
                        <span className="font-mono text-gray-900">{inv.invoiceNumber}</span>
                        <span className="text-gray-500">{inv.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Invoice #</div>
                  <div className="text-xs text-gray-400 italic">-</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Amount</div>
                  <div className="text-xs text-gray-400 italic">-</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Date Paid</div>
                  <div className="text-xs text-gray-400 italic">-</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Reference #</div>
                  <div className="text-xs text-gray-400 italic">-</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Total Paid</div>
                  <div className="text-xs text-gray-400 italic">-</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Available Balance</div>
                  <div className="text-xs text-green-600 italic">-</div>
                </div>
              </div>
            )}
            {recentPayment && !isStakeholder && (
              <button
                onClick={() => router.push('/fuel-payments/invoices')}
                className="mt-3 w-full text-xs text-blue-600 hover:text-blue-800 font-medium"
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
              <div
                key={`dashboard-pair-${segment[0]}-${segment[1]}`}
                className="flex flex-col lg:flex-row gap-6 mb-6 w-full items-stretch"
              >
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
            )
          }
          return (
            <WidgetWrapper
              key={segment[0]}
              id={segment[0]}
              contentClassName={
                segment[0] === 'customer-ar-glance' ? 'w-full min-w-0' : undefined
              }
            >
              {renderOne(segment[0])}
            </WidgetWrapper>
          )
        })}
        </div>

      {/* Add Pay Day Modal */}
      {payDayModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setPayDayModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
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
                      fetchUpcoming()
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
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
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
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
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
                    fetchUpcoming()
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
  )
}

