'use client'

import { useEffect, useState, useRef } from 'react'
import { formatCurrency } from '@/lib/format'
import { pdfIframeSrc } from '@/lib/pdf-iframe-src'
import { useRouter } from 'next/navigation'
import { DayReport } from '@/lib/types'
import * as XLSX from 'xlsx'
import CustomDatePicker from './CustomDatePicker'
import DayScanStrip from './DayScanStrip'
import DepositBreakdownModal from './DepositBreakdownModal'
import OtherItemsBreakdownModal from './OtherItemsBreakdownModal'

type FilterType = 'all' | 'yesterday' | 'today' | 'thisWeek' | 'month' | 'custom'

export default function DaysPage() {
  const router = useRouter()
  const [dayReports, setDayReports] = useState<DayReport[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [customDate, setCustomDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const customPickerRef = useRef<HTMLDivElement>(null)
  const [showDepositBreakdown, setShowDepositBreakdown] = useState<string | null>(null)
  const [showOtherItemsBreakdown, setShowOtherItemsBreakdown] = useState<string | null>(null)
  const [emailModal, setEmailModal] = useState<{ subject: string; body: string; urls: string[] } | null>(null)
  const [emailRecipients, setEmailRecipients] = useState<{ id: string; label: string; email: string }[]>([])
  const [emailToId, setEmailToId] = useState('')
  const [emailOther, setEmailOther] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [scanPreview, setScanPreview] = useState<{ url: string; title: string } | null>(null)

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
  
  const fetchDayReports = () => {
    setLoading(true)
    fetch('/api/days', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        setDayReports(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching day reports:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchDayReports()
  }, [])

  useEffect(() => {
    if (!scanPreview) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setScanPreview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [scanPreview])

  // Refetch when user returns to this tab so new shifts show without full reload
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchDayReports()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  
  const toggleExpand = (date: string) => {
    const newExpanded = new Set(expandedDates)
    if (newExpanded.has(date)) {
      newExpanded.delete(date)
    } else {
      newExpanded.add(date)
    }
    setExpandedDates(newExpanded)
  }

  const refreshDayReports = () => fetchDayReports()

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

  // Get start of week (Monday)
  const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
    return new Date(d.setDate(diff))
  }

  // Get end of week (Sunday)
  const getEndOfWeek = (date: Date): Date => {
    const start = getStartOfWeek(date)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return end
  }

  // Format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  // Filter day reports based on active filter
  const getFilteredReports = (): DayReport[] => {
    if (activeFilter === 'all') {
      return dayReports
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = formatDate(today)

    if (activeFilter === 'today') {
      return dayReports.filter(r => r.date === todayStr)
    }

    if (activeFilter === 'yesterday') {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = formatDate(yesterday)
      return dayReports.filter(r => r.date === yesterdayStr)
    }

    if (activeFilter === 'thisWeek') {
      const weekStart = getStartOfWeek(today)
      const weekEnd = getEndOfWeek(today)
      const weekStartStr = formatDate(weekStart)
      const weekEndStr = formatDate(weekEnd)
      return dayReports.filter(r => r.date >= weekStartStr && r.date <= weekEndStr)
    }

    if (activeFilter === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      const monthStartStr = formatDate(monthStart)
      const monthEndStr = formatDate(monthEnd)
      return dayReports.filter(r => r.date >= monthStartStr && r.date <= monthEndStr)
    }

    if (activeFilter === 'custom' && customDate) {
      return dayReports.filter(r => r.date === customDate)
    }

    return dayReports
  }

  const filteredReports = getFilteredReports()
  
  const OS_THRESHOLD = 20

  const getOsColor = (amount: number) => {
    if (Math.abs(amount) <= OS_THRESHOLD) return 'text-green-600'
    if (amount > 0) return 'text-blue-600'
    return 'text-red-600'
  }

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
      ['Total Over/Short', formatCurrency(dayReport.totals.overShortTotal)],
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
        formatCurrency(shift.overShortTotal),
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
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Email scan modal: pick recipient and send via API. (Future: WhatsApp button can open share with same link.) */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
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
      {/* Scan preview (same pattern as bank deposit comparisons) */}
      {scanPreview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="eod-scan-preview-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
            onClick={() => setScanPreview(null)}
            aria-label="Close preview"
          />
          <div className="relative z-10 flex w-full max-w-4xl max-h-[min(92vh,900px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 id="eod-scan-preview-title" className="text-sm font-semibold text-slate-900 truncate pr-2" title={scanPreview.title}>
                {scanPreview.title}
              </h3>
              <a
                href={scanPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-600 hover:underline shrink-0"
              >
                Open in new tab
              </a>
              <button
                type="button"
                onClick={() => setScanPreview(null)}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="min-h-[50vh] flex-1 bg-slate-100">
              <iframe
                src={pdfIframeSrc(scanPreview.url)}
                className="h-[min(75vh,720px)] w-full border-0"
                title={scanPreview.title}
              />
            </div>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-gray-900">End of Day</h1>
        </div>
        
        {/* Filter Buttons */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setActiveFilter('all')
              setShowCustomPicker(false)
            }}
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
              activeFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => {
              setActiveFilter('yesterday')
              setShowCustomPicker(false)
            }}
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
              activeFilter === 'yesterday'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Yesterday
          </button>
          <button
            onClick={() => {
              setActiveFilter('today')
              setShowCustomPicker(false)
            }}
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
              activeFilter === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => {
              setActiveFilter('thisWeek')
              setShowCustomPicker(false)
            }}
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
              activeFilter === 'thisWeek'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => {
              setActiveFilter('month')
              setShowCustomPicker(false)
            }}
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
              activeFilter === 'month'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Month
          </button>
          <div className="relative" ref={customPickerRef}>
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
              Custom {activeFilter === 'custom' && customDate ? `(${customDate})` : '▼'}
            </button>
            
            {/* Custom Date Picker */}
            {showCustomPicker && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-xl z-50 p-4 min-w-[320px]">
                <CustomDatePicker
                  selectedDate={customDate}
                  onDateSelect={(date) => {
                    setCustomDate(date)
                    setActiveFilter('custom')
                    setShowCustomPicker(false)
                  }}
                  onClose={() => setShowCustomPicker(false)}
                />
              </div>
            )}
          </div>
          {activeFilter !== 'all' && (
            <span className="text-sm text-gray-600 ml-2">
              ({filteredReports.length} end of day{filteredReports.length !== 1 ? 's' : ''})
            </span>
          )}
          <button
            onClick={refreshDayReports}
            disabled={loading}
            className="ml-auto px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold text-sm hover:bg-gray-300 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        
        {dayReports.length === 0 ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded p-8 text-center text-gray-500">
            No end of day records found. Create shifts to generate end of day records.
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded p-8 text-center text-gray-500">
            No end of day records found for the selected filter.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((dayReport) => {
              const isExpanded = expandedDates.has(dayReport.date)
              
              return (
                <div key={dayReport.date} className="bg-white shadow-sm border border-gray-200 rounded">
                  {/* Clickable Header */}
                  <div
                    className="p-4 cursor-pointer select-none hover:bg-gray-50 transition-colors"
                    onClick={() => toggleExpand(dayReport.date)}
                  >
                    <div className="flex justify-between items-center gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-gray-400 text-lg flex-shrink-0">{isExpanded ? '▼' : '▶'}</span>
                        <div className="min-w-0">
                          <h2 className="text-xl font-bold text-gray-900">{dayReport.date}</h2>
                          <div className="mt-1 flex flex-wrap gap-3 items-center">
                            {getStatusBadge(dayReport.status)}
                            <span className="text-sm text-gray-600">
                              {dayReport.dayType} Day • {dayReport.shifts.length} shift(s)
                            </span>
                            {!isExpanded && (
                              <span className="text-sm text-gray-500 flex flex-wrap gap-x-3 gap-y-1 items-center">
                                <span>
                                  O/S:&nbsp;
                                  <span className={`font-semibold ${getOsColor(dayReport.totals.overShortTotal)}`}>
                                    {formatCurrency(dayReport.totals.overShortTotal)}
                                  </span>
                                </span>
                                <span>Deposits: <span className="font-semibold text-gray-700">{formatCurrency(dayReport.totals.totalDeposits)}</span></span>
                                <span>Credit: <span className="font-semibold text-gray-700">{formatCurrency(dayReport.totals.totalCredit)}</span></span>
                                <span>Debit: <span className="font-semibold text-gray-700">{formatCurrency(dayReport.totals.totalDebit)}</span></span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Deposit & Debit slip upload indicators — collapsed only */}
                        {!isExpanded && (
                          <div className="flex items-center gap-2">
                            {dayReport.missingDepositSlipAlertOpen && (
                              <span
                                className="text-amber-600 text-lg leading-none"
                                title="Open missing deposit slip scan alert for this day"
                                aria-label="Missing deposit slip alert open"
                              >
                                ⚑
                              </span>
                            )}
                            <div
                              className="relative"
                              title={
                                dayReport.depositScans.length > 0
                                  ? `${dayReport.depositScans.length} deposit slip(s) uploaded`
                                  : 'No deposit slips uploaded'
                              }
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-7 h-7 text-blue-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              <span
                                className={`absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold leading-none ${dayReport.depositScans.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                              >
                                {dayReport.depositScans.length > 0 ? '✓' : '✕'}
                              </span>
                            </div>
                            <div
                              className="relative"
                              title={
                                dayReport.debitScans.length > 0
                                  ? `${dayReport.debitScans.length} debit slip(s) uploaded`
                                  : 'No debit slips uploaded'
                              }
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-7 h-7 text-violet-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                                />
                              </svg>
                              <span
                                className={`absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold leading-none ${dayReport.debitScans.length > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                              >
                                {dayReport.debitScans.length > 0 ? '✓' : '✕'}
                              </span>
                            </div>
                            <div
                              className="relative"
                              title={(() => {
                                const n = (dayReport.securityScans ?? []).length
                                if (n > 0) return `${n} security slip(s) uploaded`
                                if (dayReport.securityScanWaived) {
                                  const note = (dayReport.securityScanWaiverNote ?? '').trim()
                                  return note
                                    ? `No security scan — marked without pickup (${note})`
                                    : 'No security scan — marked without pickup'
                                }
                                return 'No security slips uploaded'
                              })()}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-7 h-7 text-emerald-700"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                />
                              </svg>
                              <span
                                className={`absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold leading-none ${
                                  (dayReport.securityScans ?? []).length > 0
                                    ? 'bg-green-500'
                                    : dayReport.securityScanWaived
                                      ? 'bg-amber-500'
                                      : 'bg-red-500'
                                }`}
                              >
                                {(dayReport.securityScans ?? []).length > 0 || dayReport.securityScanWaived ? '✓' : '✕'}
                              </span>
                            </div>
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); exportToExcel(dayReport) }}
                          className="px-4 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700"
                        >
                          Export Excel
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible body */}
                  {isExpanded && (
                    <>
                  {/* Money Summary */}
                  <div className="p-4 border-t border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-3">Money Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Total Over/Short</p>
                        <p className={`text-lg font-bold ${getOsColor(dayReport.totals.overShortTotal)}`}>
                          {formatCurrency(dayReport.totals.overShortTotal)}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-gray-600">Total Deposits</p>
                          {dayReport.missingDepositSlipAlertOpen && (
                            <span
                              className="text-amber-600 text-sm"
                              title="Open missing deposit slip scan alert"
                            >
                              ⚑
                            </span>
                          )}
                          <button
                            onClick={() => setShowDepositBreakdown(dayReport.date)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                            title="View deposit breakdown"
                          >
                            ℹ️
                          </button>
                        </div>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(dayReport.totals.totalDeposits)}</p>
                      </div>
                      <div className="md:col-span-2 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <p className="text-sm font-medium text-gray-800">Other items — credit &amp; debit</p>
                          <button
                            type="button"
                            onClick={() => setShowOtherItemsBreakdown(dayReport.date)}
                            className="text-violet-700 hover:text-violet-900 text-sm font-semibold"
                            title="View other items breakdown and compare scans"
                          >
                            ℹ️
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <p className="text-xs text-gray-600">Total Credit</p>
                            <p className="text-lg font-bold text-gray-900">{formatCurrency(dayReport.totals.totalCredit)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Total Debit</p>
                            <p className="text-lg font-bold text-gray-900">{formatCurrency(dayReport.totals.totalDebit)}</p>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">System Cash + Check</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(dayReport.totals.systemCashTotal)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Counted Cash + Check</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(dayReport.totals.countCashTotal)}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Fuel Summary */}
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-3">Fuel Summary</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Total Unleaded</p>
                        <p className="text-lg font-bold text-gray-900">{dayReport.totals.totalUnleaded.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Diesel</p>
                        <p className="text-lg font-bold text-gray-900">{dayReport.totals.totalDiesel.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Document scans — bank comparisons–style strip + preview modal */}
                  <div className="border-b border-gray-200 bg-white">
                    <div className="px-4 pt-3">
                      <h3 className="font-semibold text-gray-900">Document scans</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Deposits, Other Items, and security — click an icon to list, preview, upload, or remove files.
                      </p>
                    </div>
                    <DayScanStrip
                      date={dayReport.date}
                      depositScans={dayReport.depositScans}
                      debitScans={dayReport.debitScans}
                      securityScans={dayReport.securityScans ?? []}
                      securityScanWaived={dayReport.securityScanWaived ?? false}
                      securityScanWaiverNote={dayReport.securityScanWaiverNote ?? ''}
                      onRefresh={refreshDayReports}
                      onOpenPreview={(url, title) => setScanPreview({ url, title })}
                    />
                    <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 pb-3 text-sm">
                      {dayReport.depositScans.length > 0 && (
                        <button
                          type="button"
                          onClick={() => openEmailModal(dayReport.date, 'deposit', dayReport.depositScans)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Email all deposit scans
                        </button>
                      )}
                      {dayReport.debitScans.length > 0 && (
                        <button
                          type="button"
                          onClick={() => openEmailModal(dayReport.date, 'debit', dayReport.debitScans)}
                          className="text-violet-700 hover:text-violet-900 font-medium"
                        >
                          Email all debit scans
                        </button>
                      )}
                      {(dayReport.securityScans ?? []).length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            openEmailModal(dayReport.date, 'security', dayReport.securityScans ?? [])
                          }
                          className="text-emerald-800 hover:text-emerald-950 font-medium"
                        >
                          Email all security scans
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Shift Breakdown */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Shift Breakdown</h3>
                    <div className="space-y-3">
                      {dayReport.shifts.map((shift) => {
                        const hasRedFlag = shift.hasRedFlag
                        return (
                          <div
                            key={shift.id}
                            className={`border rounded p-4 ${hasRedFlag ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="font-semibold text-gray-900">{shift.shift}</span>
                                <span className="ml-2 text-sm text-gray-600">• {shift.supervisor}</span>
                              </div>
                              <button
                                onClick={() => router.push(`/shifts/${shift.id}`)}
                                className="text-sm text-blue-600 hover:underline"
                              >
                                View Details
                              </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm">
                              <div>
                                <span className="text-gray-600">Over/Short: </span>
                                <span className={`font-semibold ${getOsColor(shift.overShortTotal)}`}>
                                  {formatCurrency(shift.overShortTotal)}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">Deposits: </span>
                                <span className="font-semibold">{shift.totalDeposits.toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Notes: </span>
                                <span className="font-semibold">{shift.notes.trim() ? '✓' : '✗'}</span>
                              </div>
                              {hasRedFlag && (
                                <div className="text-red-600 font-semibold">🚨 RED FLAG</div>
                              )}
                            </div>
                            {shift.notes.trim() && (
                              <div className="mt-2 text-sm text-gray-600 bg-white p-2 rounded border border-gray-200">
                                {shift.notes}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  </>
                  )}
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
            onClose={() => setShowDepositBreakdown(null)}
            onSaved={refreshDayReports}
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
            onClose={() => setShowOtherItemsBreakdown(null)}
          />
        )
      })()}
    </div>
  )
}

