'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/format'
import { useRouter, useSearchParams } from 'next/navigation'
import { depositComparisonsPath, parseFocusDate } from '@/lib/daily-close-path'
import { OS_REVIEW_THRESHOLD } from '@/lib/calculations'
import { slipsStillNeeded } from '@/lib/day-slip-tasks'
import { DayReport } from '@/lib/types'
import {
  businessTodayYmd,
  toYmdInBusinessTz,
  ymdToUtcNoonDate
} from '@/lib/datetime-policy'
import * as XLSX from 'xlsx'
import DaySlipTasks, { CollapsedSlipIcons } from './DaySlipTasks'
import DepositBreakdownModal from './DepositBreakdownModal'
import OtherItemsBreakdownModal from './OtherItemsBreakdownModal'
import { shouldRefetchOnVisibility } from '@/lib/refetch-on-visibility'

type FilterType = 'all' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom'

function lastDayOfMonthYmd(year: number, month1to12: number): string {
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

function padMonth(month: number): string {
  return String(month).padStart(2, '0')
}

function mergeDayReports(prev: DayReport[], incoming: DayReport[]): DayReport[] {
  const byDate = new Map(prev.map((d) => [d.date, d]))
  for (const d of incoming) byDate.set(d.date, d)
  return [...byDate.values()].sort((a, b) => (a.date > b.date ? -1 : 1))
}

function formatCustomMonthLabel(yyyyMm: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm)
  if (!match) return yyyyMm
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return yyyyMm
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

function monthRangeFromYyyyMm(yyyyMm: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  const from = `${year}-${padMonth(month)}-01`
  const to = lastDayOfMonthYmd(year, month)
  return { from, to }
}

function daysQueryForFilter(
  filter: FilterType,
  customMonth: string
): { key: string; url: string; from?: string; to?: string } | null {
  const todayYmd = businessTodayYmd()
  if (filter === 'custom') {
    const range = monthRangeFromYyyyMm(customMonth)
    if (!range) return null
    return {
      key: `month:${range.from}`,
      url: `/api/days?from=${range.from}&to=${range.to}`,
      from: range.from,
      to: range.to
    }
  }
  if (filter === 'all') {
    return { key: 'all:120', url: '/api/days?recentDays=120' }
  }
  const [y, m] = todayYmd.split('-').map(Number)
  if (filter === 'thisMonth') {
    const from = `${y}-${padMonth(m)}-01`
    const to = lastDayOfMonthYmd(y, m)
    return { key: `month:${from}`, url: `/api/days?from=${from}&to=${to}`, from, to }
  }
  if (filter === 'lastMonth') {
    const ly = m === 1 ? y - 1 : y
    const lm = m === 1 ? 12 : m - 1
    const from = `${ly}-${padMonth(lm)}-01`
    const to = lastDayOfMonthYmd(ly, lm)
    return { key: `month:${from}`, url: `/api/days?from=${from}&to=${to}`, from, to }
  }

  const today = ymdToUtcNoonDate(todayYmd)
  const startOfWeek = (date: Date): Date => {
    const d = new Date(date)
    const day = d.getDay() || 7
    if (day !== 1) d.setDate(d.getDate() - (day - 1))
    d.setHours(0, 0, 0, 0)
    return d
  }
  const ymd = (d: Date) => toYmdInBusinessTz(d)

  if (filter === 'thisWeek') {
    const from = ymd(startOfWeek(today))
    const end = new Date(startOfWeek(today))
    end.setDate(end.getDate() + 6)
    const to = ymd(end)
    return { key: `week:${from}`, url: `/api/days?from=${from}&to=${to}`, from, to }
  }
  if (filter === 'lastWeek') {
    const thisWeekStart = startOfWeek(today)
    const lastWeekEnd = new Date(thisWeekStart)
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1)
    const lastWeekStart = startOfWeek(lastWeekEnd)
    const from = ymd(lastWeekStart)
    const to = ymd(lastWeekEnd)
    return { key: `week:${from}`, url: `/api/days?from=${from}&to=${to}`, from, to }
  }
  return null
}

function uniqueDayBagNumbers(dayReport: DayReport): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const shift of dayReport.shifts) {
    for (const raw of shift.depositBagNumbers ?? []) {
      const bag = String(raw).trim()
      if (!bag || seen.has(bag)) continue
      seen.add(bag)
      out.push(bag)
    }
  }
  return out
}

function BagNumberChips({ bags }: { bags: string[] }) {
  if (bags.length === 0) return null
  return (
    <span className="inline-flex items-center gap-1 min-w-0 flex-wrap">
      <span className="text-[11px] font-medium text-slate-400">Bags</span>
      {bags.map((bag) => (
        <span
          key={bag}
          className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono font-medium text-slate-700"
          title={`Night deposit bag ${bag}`}
        >
          {bag}
        </span>
      ))}
    </span>
  )
}

function DaysPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusDate = parseFocusDate(searchParams.get('date'))
  const [dayReports, setDayReports] = useState<DayReport[]>([])
  const [loading, setLoading] = useState(true)
  const [rangeLoading, setRangeLoading] = useState(false)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() =>
    focusDate ? new Set([focusDate]) : new Set()
  )
  const [activeFilter, setActiveFilter] = useState<FilterType>(() => {
    if (!focusDate) return 'thisMonth'
    return focusDate.slice(0, 7) === businessTodayYmd().slice(0, 7) ? 'thisMonth' : 'custom'
  })
  const [customMonth, setCustomMonth] = useState<string>(() => (focusDate ? focusDate.slice(0, 7) : ''))
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const customPickerRef = useRef<HTMLDivElement>(null)
  const loadedRangeKeys = useRef(new Set<string>())
  const fetchSeq = useRef(0)
  const [showDepositBreakdown, setShowDepositBreakdown] = useState<string | null>(null)
  const [depositMissingSlipOpen, setDepositMissingSlipOpen] = useState(false)
  const [depositScansOpen, setDepositScansOpen] = useState(false)
  const [showOtherItemsBreakdown, setShowOtherItemsBreakdown] = useState<string | null>(null)
  const [otherItemsScansOpen, setOtherItemsScansOpen] = useState(false)
  const [emailModal, setEmailModal] = useState<{ subject: string; body: string; urls: string[] } | null>(null)
  const [emailRecipients, setEmailRecipients] = useState<{ id: string; label: string; email: string }[]>([])
  const [emailToId, setEmailToId] = useState('')
  const [emailOther, setEmailOther] = useState('')
  const [emailSending, setEmailSending] = useState(false)

  const clearFocusDate = useCallback(() => {
    if (!searchParams.get('date')) return
    router.replace('/days', { scroll: false })
  }, [router, searchParams])

  const selectFilter = useCallback(
    (filter: FilterType) => {
      setActiveFilter(filter)
      if (filter !== 'custom') setShowCustomPicker(false)
      clearFocusDate()
    },
    [clearFocusDate]
  )

  useEffect(() => {
    if (!focusDate) return
    setExpandedDates(new Set([focusDate]))
    const month = focusDate.slice(0, 7)
    if (month === businessTodayYmd().slice(0, 7)) {
      setActiveFilter('thisMonth')
    } else {
      setCustomMonth(month)
      setActiveFilter('custom')
    }
  }, [focusDate])

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
  
  const fetchRange = useCallback((filter: FilterType, custom: string, force = false) => {
    const query = daysQueryForFilter(filter, custom)
    if (!query) return
    if (!force && loadedRangeKeys.current.has('all:120') && filter !== 'custom') return
    if (!force && loadedRangeKeys.current.has(query.key)) return

    const initial = loadedRangeKeys.current.size === 0
    const seq = ++fetchSeq.current
    if (force || initial) setLoading(true)
    else setRangeLoading(true)

    fetch(query.url, { cache: 'no-store' })
      .then(async (res) => {
        const data: unknown = await res.json()
        if (seq !== fetchSeq.current) return
        if (!res.ok || !Array.isArray(data)) {
          console.error('Error fetching day reports:', !res.ok ? res.status : 'invalid payload', data)
          if (initial) setDayReports([])
          return
        }
        loadedRangeKeys.current.add(query.key)
        setDayReports((prev) => mergeDayReports(prev, data as DayReport[]))
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return
        console.error('Error fetching day reports:', err)
        if (initial) setDayReports([])
      })
      .finally(() => {
        if (seq !== fetchSeq.current) return
        setLoading(false)
        setRangeLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchRange(activeFilter, customMonth)
  }, [activeFilter, customMonth, fetchRange])

  const tabHiddenAtRef = useRef<number | null>(null)

  // Refetch when user returns after tab was hidden ≥3 min (avoids churn on quick tab switches)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now()
        return
      }
      if (
        document.visibilityState === 'visible' &&
        shouldRefetchOnVisibility(tabHiddenAtRef.current)
      ) {
        tabHiddenAtRef.current = null
        fetchRange(activeFilter, customMonth, true)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [activeFilter, customMonth, fetchRange])
  
  const toggleExpand = (date: string) => {
    setExpandedDates((current) => {
      const next = new Set(current)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const refreshDayReports = () => {
    const query = daysQueryForFilter(activeFilter, customMonth)
    if (query) loadedRangeKeys.current.delete(query.key)
    fetchRange(activeFilter, customMonth, true)
  }

  const toAbsoluteUrl = (url: string) =>
    url.startsWith('http') ? url : (typeof window !== 'undefined' ? `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}` : url)

  const openEmailModal = (date: string, scanType: 'deposit' | 'debit' | 'security', urlOrUrls: string | string[]) => {
    const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls]
    const links = urls.map(toAbsoluteUrl)
    const label =
      scanType === 'deposit' ? 'Deposit' : scanType === 'debit' ? 'Debit' : 'Security'
    const singular = scanType === 'deposit' ? 'deposit' : scanType === 'debit' ? 'debit' : 'security'
    const plural = scanType === 'deposit' ? 'deposit' : scanType === 'debit' ? 'debit' : 'security'
    const subject = links.length > 1
      ? `${label} Scans - ${date} (${links.length} files)`
      : `${label} Scan - ${date}`
    const body = links.length > 1
      ? `Please find the ${plural} scans from ${date}.\n\n${links.map((link, i) => `Scan ${i + 1}: ${link}`).join('\n')}`
      : `Please find the ${singular} scan from ${date}.\n\nLink: ${links[0]}`
    setEmailModal({ subject, body, urls: links })
    setEmailToId('')
    setEmailOther('')
    fetch('/api/email-recipients')
      .then((res) => res.json())
      .then((data) => {
        const raw = Array.isArray(data) ? data : []
        const list = raw.map((r: { id: string; label?: string; email?: string }) => ({
          id: String(r.id),
          label: r.label ?? '',
          email: r.email ?? ''
        }))
        setEmailRecipients(list)
        if (list.length > 0) setEmailToId(list[0].id)
        else setEmailToId('other')
      })
      .catch(() => {
        setEmailRecipients([])
        setEmailToId('other')
      })
  }

  const closeEmailModal = () => setEmailModal(null)

  const sendEmail = async () => {
    if (!emailModal) return
    const to = emailOther.trim() || (emailToId && emailToId !== 'other' ? emailRecipients.find((r) => r.id === emailToId)?.email?.trim() : '') || ''
    if (!to) {
      alert('Choose a recipient from the list or enter an email address below.')
      return
    }
    setEmailSending(true)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: emailModal.subject,
          html: emailModal.body.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<>]+)/g, '<a href="$1">$1</a>')
        })
      })
      if (res.ok) {
        closeEmailModal()
        alert('Email sent.')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to send email')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to send email')
    } finally {
      setEmailSending(false)
    }
  }

  const filteredReports = useMemo(() => {
    if (activeFilter === 'all') return dayReports
    if (activeFilter === 'custom' && !monthRangeFromYyyyMm(customMonth)) return []
    const query = daysQueryForFilter(activeFilter, customMonth)
    if (!query?.from || !query.to) return dayReports
    return dayReports.filter((r) => r.date >= query.from! && r.date <= query.to!)
  }, [dayReports, activeFilter, customMonth])

  useEffect(() => {
    if (!focusDate || loading || rangeLoading) return
    const el = document.getElementById(`eod-day-${focusDate}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusDate, loading, rangeLoading, filteredReports.length])
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Complete':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">✅ Complete</span>
      case 'Incomplete':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">⚠️ Incomplete</span>
      case 'Invalid mix':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm">❌ Invalid mix</span>
      default:
        return null
    }
  }
  
  const exportToExcel = (dayReport: DayReport) => {
    const wb = XLSX.utils.book_new()
    
    // Day Summary
    const summaryData = [
      ['End of Day'],
      ['Date', dayReport.date],
      ['Day Type', dayReport.dayType],
      ['Status', dayReport.status],
      [],
      ['Money Summary'],
      [
        'Total Over/Short (disclosed)',
        dayReport.totals.overShortDisclosedTotal === null
          ? '--'
          : formatCurrency(dayReport.totals.overShortDisclosedTotal)
      ],
      ['Total Deposits', formatCurrency(dayReport.totals.totalDeposits)],
      ['Total Credit', formatCurrency(dayReport.totals.totalCredit)],
      ['Total Debit', formatCurrency(dayReport.totals.totalDebit)],
      ['System Cash+Check Total', formatCurrency(dayReport.totals.systemCashTotal)],
      ['Counted Cash+Check Total', formatCurrency(dayReport.totals.countCashTotal)],
      [],
      ['Fuel Summary'],
      ['Total Unleaded', dayReport.totals.totalUnleaded.toFixed(2)],
      ['Total Diesel', dayReport.totals.totalDiesel.toFixed(2)],
      [],
      ['Shift Breakdown'],
      ['Shift', 'Supervisor', 'Over/Short', 'Deposits', 'Notes Present']
    ]
    
    dayReport.shifts.forEach(shift => {
      summaryData.push([
        shift.shift,
        shift.supervisor,
        `${formatCurrency(shift.overShortTotal)} (system) / ${
          shift.osReviewed != null
            ? formatCurrency(shift.osReviewed)
            : shift.osLegitAsIs
              ? 'legit as-is'
              : '—'
        }`,
        formatCurrency(shift.totalDeposits),
        shift.notes.trim() ? 'Yes' : 'No'
      ])
    })
    
    const ws = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, ws, dayReport.date)
    
    XLSX.writeFile(wb, `day-report-${dayReport.date}.xlsx`)
  }
  
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gray-50 px-4 py-8 sm:min-h-screen sm:p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      {/* Email scan modal: pick recipient and send via API. (Future: WhatsApp button can open share with same link.) */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Email scan</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send to</label>
                <select
                  value={emailToId}
                  onChange={(e) => setEmailToId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  <option value="">Choose a recipient…</option>
                  {emailRecipients.map((r) => (
                    <option key={r.id} value={r.id}>{r.label} ({r.email})</option>
                  ))}
                  <option value="other">Other (enter below)</option>
                </select>
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Or enter another email address</label>
                  <input
                    type="email"
                    placeholder="e.g. someone@example.com"
                    value={emailOther}
                    onChange={(e) => setEmailOther(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={emailModal.subject}
                  onChange={(e) => setEmailModal((m) => (m ? { ...m, subject: e.target.value } : null))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={emailModal.body}
                  onChange={(e) => setEmailModal((m) => (m ? { ...m, body: e.target.value } : null))}
                  rows={4}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEmailModal}
                className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendEmail}
                disabled={emailSending || (!emailOther.trim() && (!emailToId || emailToId === 'other'))}
                className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {emailSending ? 'Sending…' : 'Send email'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">End of Day</h1>
        </div>
        {focusDate ? (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Opened for <span className="font-semibold">{focusDate}</span>
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href={depositComparisonsPath(focusDate)} className="font-semibold text-blue-700 hover:underline">
                Review deposits for this date
              </Link>
              <button type="button" onClick={clearFocusDate} className="font-medium text-blue-800 hover:underline">
                Show all days
              </button>
            </div>
          </div>
        ) : null}
        
        {/* Filter Buttons */}
        <div className="mb-6 space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          <button
            onClick={() => selectFilter('all')}
            className={`min-h-[44px] rounded px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
              activeFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => selectFilter('thisWeek')}
            className={`min-h-[44px] rounded px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
              activeFilter === 'thisWeek'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => selectFilter('lastWeek')}
            className={`min-h-[44px] rounded px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
              activeFilter === 'lastWeek'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Last Week
          </button>
          <button
            onClick={() => selectFilter('thisMonth')}
            className={`min-h-[44px] rounded px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
              activeFilter === 'thisMonth'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => selectFilter('lastMonth')}
            className={`min-h-[44px] rounded px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
              activeFilter === 'lastMonth'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Last Month
          </button>
          <div className="relative col-span-2 sm:col-span-1" ref={customPickerRef}>
            <button
              onClick={() => {
                selectFilter('custom')
                setShowCustomPicker(!showCustomPicker)
              }}
              className={`min-h-[44px] w-full rounded px-3 py-2 text-xs font-semibold transition-colors sm:w-auto sm:px-4 sm:text-sm ${
                activeFilter === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Custom {activeFilter === 'custom' && customMonth
                ? `(${formatCustomMonthLabel(customMonth)})`
                : '▼'}
            </button>
            {showCustomPicker && (
              <div className="absolute top-full right-0 z-50 mt-2 min-w-[280px] rounded-lg border border-gray-300 bg-white p-4 shadow-xl sm:left-0 sm:right-auto">
                <div className="mb-2 text-sm font-semibold text-gray-700">
                  Select Month
                </div>
                <input
                  type="month"
                  autoFocus
                  value={customMonth}
                  onChange={(e) => {
                    setCustomMonth(e.target.value)
                    setActiveFilter('custom')
                    setShowCustomPicker(false)
                    clearFocusDate()
                  }}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {activeFilter !== 'all' && !(activeFilter === 'custom' && !customMonth) && (
            <span className="text-xs text-gray-600 sm:text-sm">
              ({filteredReports.length} end of day{filteredReports.length !== 1 ? 's' : ''})
            </span>
          )}
          <button
            onClick={refreshDayReports}
            disabled={loading}
            className="min-h-[44px] w-full rounded bg-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50 sm:ml-auto sm:w-auto sm:text-sm"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          </div>
        </div>
        
        {(loading || rangeLoading) && filteredReports.length === 0 ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded p-8 text-center text-gray-500">
            Loading…
          </div>
        ) : activeFilter === 'custom' && !customMonth ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded p-8 text-center text-gray-500">
            Select a month to load end of day records.
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded p-8 text-center text-gray-500">
            {activeFilter === 'all'
              ? 'No end of day records found. Create shifts to generate end of day records.'
              : 'No end of day records found for the selected filter.'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((dayReport) => {
              const isExpanded = expandedDates.has(dayReport.date)
              const dayBags = uniqueDayBagNumbers(dayReport)
              const shiftLine = dayReport.shifts.map((shift) => `${shift.shift} · ${shift.supervisor}`).join(' · ')
              const slipsLeft = slipsStillNeeded(dayReport)
              
              return (
                <div
                  id={`eod-day-${dayReport.date}`}
                  key={dayReport.date}
                  className={`bg-white shadow-sm border rounded ${
                    focusDate === dayReport.date ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'
                  }`}
                >
                  <div
                    className="cursor-pointer select-none p-4 hover:bg-gray-50"
                    onClick={() => toggleExpand(dayReport.date)}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex-shrink-0 text-lg text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <h2 className="text-lg font-bold text-gray-900 sm:text-xl">{dayReport.date}</h2>
                            <BagNumberChips bags={dayBags} />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
                            {dayReport.status === 'Complete' ? (
                              slipsLeft === 0 ? (
                                <span className="rounded bg-green-100 px-2 py-1 text-sm text-green-800">Slips filed</span>
                              ) : (
                                <span className="rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-950">
                                  {slipsLeft === 1 ? '1 slip still needed' : `${slipsLeft} slips still needed`}
                                </span>
                              )
                            ) : (
                              getStatusBadge(dayReport.status)
                            )}
                            <span className="text-sm text-gray-600">
                              {isExpanded ? shiftLine || `${dayReport.dayType} Day` : `${dayReport.dayType} Day • ${dayReport.shifts.length} shift(s)`}
                            </span>
                            {!isExpanded ? (
                              <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
                                <span>
                                  O/S:{' '}
                                  {dayReport.totals.overShortDisclosedTotal === null ? (
                                    <span className="font-semibold text-gray-500">--</span>
                                  ) : (
                                    <span
                                      className={`font-semibold ${
                                        Math.abs(dayReport.totals.overShortDisclosedTotal) <= OS_REVIEW_THRESHOLD
                                          ? 'text-green-600'
                                          : dayReport.totals.overShortDisclosedTotal > 0
                                            ? 'text-blue-600'
                                            : 'text-red-600'
                                      }`}
                                    >
                                      {formatCurrency(dayReport.totals.overShortDisclosedTotal)}
                                    </span>
                                  )}
                                </span>
                                <span>
                                  Deposits:{' '}
                                  <span className="font-semibold text-gray-700">
                                    {formatCurrency(dayReport.totals.totalDeposits)}
                                  </span>
                                </span>
                                <span>
                                  Credit:{' '}
                                  <span className="font-semibold text-gray-700">
                                    {formatCurrency(dayReport.totals.totalCredit)}
                                  </span>
                                </span>
                                <span>
                                  Debit:{' '}
                                  <span className="font-semibold text-gray-700">
                                    {formatCurrency(dayReport.totals.totalDebit)}
                                  </span>
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {!isExpanded ? <CollapsedSlipIcons dayReport={dayReport} /> : null}
                    </div>
                  </div>

                  {isExpanded ? (
                  <DaySlipTasks
                    dayReport={dayReport}
                    onRefresh={refreshDayReports}
                    onEmail={(kind) => {
                      const urls =
                        kind === 'deposit'
                          ? dayReport.depositScans
                          : kind === 'debit'
                            ? dayReport.debitScans
                            : dayReport.securityScans ?? []
                      openEmailModal(dayReport.date, kind, urls)
                    }}
                    onMissingDepositSlip={() => {
                      setDepositMissingSlipOpen(true)
                      setDepositScansOpen(false)
                      setShowDepositBreakdown(dayReport.date)
                    }}
                    onCompare={(kind) => {
                      if (kind === 'deposit') {
                        setDepositMissingSlipOpen(false)
                        setDepositScansOpen(true)
                        setShowDepositBreakdown(dayReport.date)
                        return
                      }
                      setOtherItemsScansOpen(true)
                      setShowOtherItemsBreakdown(dayReport.date)
                    }}
                    reviewHref={depositComparisonsPath(dayReport.date)}
                    onExport={() => exportToExcel(dayReport)}
                    onOpenShift={(shiftId) => router.push(`/shifts/${shiftId}`)}
                  />
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      {/* Deposit Breakdown Modal */}
      {showDepositBreakdown && (() => {
        const dayReport = dayReports.find((r) => r.date === showDepositBreakdown)
        if (!dayReport) return null
        return (
          <DepositBreakdownModal
            date={dayReport.date}
            dayReport={dayReport}
            depositScanUrls={dayReport.depositScans}
            onClose={() => {
              setShowDepositBreakdown(null)
              setDepositMissingSlipOpen(false)
              setDepositScansOpen(false)
            }}
            onSaved={refreshDayReports}
            startWithMissingSlip={depositMissingSlipOpen}
            startWithScans={depositScansOpen}
          />
        )
      })()}
      {showOtherItemsBreakdown && (() => {
        const dayReport = dayReports.find((r) => r.date === showOtherItemsBreakdown)
        if (!dayReport) return null
        return (
          <OtherItemsBreakdownModal
            date={dayReport.date}
            dayReport={dayReport}
            debitScanUrls={dayReport.debitScans}
            onClose={() => {
              setShowOtherItemsBreakdown(null)
              setOtherItemsScansOpen(false)
            }}
            startWithScans={otherItemsScansOpen}
          />
        )
      })()}
    </div>
  )
}

export default function DaysPageRoute() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
      }
    >
      <DaysPage />
    </Suspense>
  )
}

