'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  type DashboardWidgetId,
  getDefaultLayout,
  loadDashboardLayout,
  saveDashboardLayout,
  moveWidgetUp,
  moveWidgetDown
} from '@/lib/dashboard-layout'

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
  notes: string
}

type MonthFilterType = 'currentMonth' | 'previousMonth' | 'custom'

interface TodayScheduled {
  staffId: string
  staffName: string
  shiftName: string
  shiftColor: string | null
}

interface TodayOnVacation {
  staffId: string
  staffName: string
}

interface TodayRoster {
  date: string
  weekStart: string
  scheduled: TodayScheduled[]
  onVacation: TodayOnVacation[]
  off: TodayOnVacation[]
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

export default function DashboardPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<MonthSummary | null>(null)
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([])
  const [recentPayment, setRecentPayment] = useState<RecentFuelPayment | null>(null)
  const [fuelExpense, setFuelExpense] = useState<number | null>(null)
  const [arSummary, setArSummary] = useState<CustomerArSummary | null>(null)
  const [todayRoster, setTodayRoster] = useState<TodayRoster | null>(null)
  const [cashbookSummary, setCashbookSummary] = useState<CashbookSummary | null>(null)
  const [fuelComparison, setFuelComparison] = useState<FuelComparisonDay[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<MonthFilterType>('currentMonth')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const customPickerRef = useRef<HTMLDivElement>(null)
  const [reminderModalOpen, setReminderModalOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState({
    title: '',
    date: '',
    notes: '',
    notifyEmail: true,
    notifyWhatsApp: false,
    notifyDaysBefore: '7,3,1,0'
  })
  const [payDayModalOpen, setPayDayModalOpen] = useState(false)
  const [payDayForm, setPayDayForm] = useState({ date: '', notes: '' })
  const [payDaySaving, setPayDaySaving] = useState(false)
  const [layout, setLayout] = useState<DashboardWidgetId[]>(getDefaultLayout)

  useEffect(() => {
    setLayout(loadDashboardLayout())
  }, [])

  useEffect(() => {
    if (!reminderModalOpen && !payDayModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReminderModalOpen(false)
        setPayDayModalOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reminderModalOpen, payDayModalOpen])

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
    fetchSummary()
    fetchUpcoming()
    fetchRecentPayment()
  }, [activeFilter, customStartDate, customEndDate])

  useEffect(() => {
    const fetchToday = async () => {
      try {
        const res = await fetch('/api/dashboard/today')
        if (res.ok) {
          const data = await res.json()
          setTodayRoster(data)
        }
      } catch (err) {
        console.error('Error fetching today roster:', err)
      }
    }
    fetchToday()
  }, [])

  useEffect(() => {
    fetch('/api/dashboard/fuel-comparison')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setFuelComparison(data) })
      .catch(() => {})
  }, [])

  // Fetch A/R summary when summary data changes (respects month filter)
  useEffect(() => {
    if (summary?.year && summary?.month) {
      fetchArSummary(summary.year, summary.month)
    } else {
      setArSummary(null)
    }
  }, [summary])

  // Fetch cashbook summary for the displayed month
  useEffect(() => {
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
      if (data?.year && data?.month) {
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
      const res = await fetch('/api/fuel-payments/recent')
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

  const groupScheduledByShift = (items: TodayScheduled[]) => {
    const map = new Map<string, { shiftName: string; color: string | null; names: string[] }>()
    items.forEach((item) => {
      const existing = map.get(item.shiftName)
      if (existing) {
        existing.names.push(item.staffName)
      } else {
        map.set(item.shiftName, {
          shiftName: item.shiftName,
          color: item.shiftColor,
          names: [item.staffName]
        })
      }
    })
    return Array.from(map.values())
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

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const visibleLayout = layout.filter(id => id !== 'fuel-volume' || fuelComparison.length > 0)

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

  const WidgetWrapper = ({
    id,
    children,
    className = ''
  }: {
    id: DashboardWidgetId
    children: React.ReactNode
    className?: string
  }) => {
    const idx = visibleLayout.indexOf(id)
    const canMoveUp = idx > 0
    const canMoveDown = idx >= 0 && idx < visibleLayout.length - 1
    return (
      <div className={`relative group mb-6 ${className}`}>
        <div className="absolute top-2 right-2 flex flex-col gap-0.5 z-10">
          <button
            onClick={() => handleMoveUp(id)}
            disabled={!canMoveUp}
            title="Move up"
            className="w-7 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 text-sm font-medium"
          >
            ↑
          </button>
          <button
            onClick={() => handleMoveDown(id)}
            disabled={!canMoveDown}
            title="Move down"
            className="w-7 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 text-sm font-medium"
          >
            ↓
          </button>
        </div>
        {children}
      </div>
    )
  }

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
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        </div>

        {/* Month Filter */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
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

        {/* Moveable widgets */}
        {visibleLayout.map((id) => (
          <WidgetWrapper key={id} id={id}>
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

            {/* Customer Accounts + Fuel Net helper band */}
            <div className="mt-2 pt-3 border-t border-dashed border-gray-200 space-y-1.5">
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
          </div>
            )}
            {id === 'phase1-status' && summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Customer A/R Summary */}
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
            {id === 'upcoming' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Upcoming</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => router.push('/settings/pay-days')}
                  className="text-xs text-gray-500 hover:text-indigo-600"
                  title="Manage pay days"
                >
                  Pay Days
                </button>
                <button
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
                  onClick={() => {
                    const today = new Date()
                    setReminderForm({
                      title: '',
                      date: today.toISOString().slice(0, 10),
                      notes: '',
                      notifyEmail: true,
                      notifyWhatsApp: false,
                      notifyDaysBefore: '7,3,1,0'
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
            {upcoming.length === 0 ? (
              <p className="text-gray-400 text-xs italic py-2">No events in next 7 days</p>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 3).map((event, index) => {
                  const getIcon = () => {
                    switch (event.type) {
                      case 'birthday': return '🎂'
                      case 'invoice': return '📄'
                      case 'contract': return '📋'
                      case 'pay-day': return '💰'
                      default: return '📅'
                    }
                  }
                  const getPriorityColor = () => {
                    switch (event.priority) {
                      case 'high': return 'border-l-2 border-red-400 bg-red-50'
                      case 'medium': return 'border-l-2 border-yellow-400 bg-yellow-50'
                      default: return 'border-l-2 border-blue-400 bg-blue-50'
                    }
                  }
                  const formatDate = (dateStr: string) => {
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
                    <div key={event.reminderId ?? index} className={`rounded p-2 ${getPriorityColor()}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-lg flex-shrink-0">{getIcon()}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-gray-900 truncate">{event.title}</div>
                            <div className="text-xs text-gray-500">{formatDate(event.date)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <div className="text-xs font-semibold text-gray-700">
                            {getDaysText()}
                          </div>
                          {event.type === 'other' && event.reminderId && (
                            <button
                              onClick={async () => {
                                if (!confirm('Delete this reminder?')) return
                                try {
                                  const res = await fetch(`/api/reminders/${event.reminderId}`, { method: 'DELETE' })
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
                              onClick={async () => {
                                if (!confirm('Delete this pay day?')) return
                                try {
                                  const res = await fetch(`/api/pay-days/${event.payDayId}`, { method: 'DELETE' })
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
                  <p className="text-xs text-gray-400 text-center pt-1">
                    +{upcoming.length - 3} more
                  </p>
                )}
              </div>
            )}
          </div>
            )}
            {id === 'today-roster' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                {todayRoster ? formatTodayDisplay(todayRoster.date) : 'Today'}
              </h3>
              <button
                onClick={() => router.push('/roster')}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Roster →
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Scheduled</div>
                {todayRoster?.scheduled && todayRoster.scheduled.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-2">
                    {groupScheduledByShift(todayRoster.scheduled).map((group) => (
                      <div key={group.shiftName} className="text-xs">
                        <div className="inline-flex items-center gap-1 font-semibold text-gray-900">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: group.color || '#94a3b8' }}
                            title={group.shiftName}
                          />
                          {group.shiftName}
                        </div>
                        <div className="mt-0.5 text-gray-700 space-y-0.5">
                          {group.names.map((name, idx) => (
                            <div key={`${group.shiftName}-${name}-${idx}`}>{name}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">No one scheduled.</p>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Who&apos;s off</div>
                {todayRoster?.off && todayRoster.off.length > 0 ? (
                  <ul className="space-y-1">
                    {todayRoster.off.map((s) => (
                      <li key={s.staffId} className="text-xs text-gray-700">
                        {s.staffName}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500 italic">No one off today.</p>
                )}
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
            {recentPayment && (
              <button
                onClick={() => router.push('/fuel-payments/invoices')}
                className="mt-3 w-full text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                View All Payments →
              </button>
            )}
          </div>
            )}
          </WidgetWrapper>
        ))}
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
                        notifyDaysBefore: reminderForm.notifyDaysBefore
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

