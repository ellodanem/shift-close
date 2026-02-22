'use client'

import { useEffect, useState, useRef } from 'react'
import { formatCurrency } from '@/lib/format'
import { useRouter } from 'next/navigation'
import { DayReport } from '@/lib/types'
import * as XLSX from 'xlsx'
import DayFileUpload from './DayFileUpload'
import CustomDatePicker from './CustomDatePicker'

type FilterType = 'all' | 'yesterday' | 'today' | 'thisWeek' | 'month' | 'custom'

export default function DaysPage() {
  const router = useRouter()
  const [dayReports, setDayReports] = useState<DayReport[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [expandedScans, setExpandedScans] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [customDate, setCustomDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const customPickerRef = useRef<HTMLDivElement>(null)
  const [showDepositBreakdown, setShowDepositBreakdown] = useState<string | null>(null)
  const [emailModal, setEmailModal] = useState<{ subject: string; body: string; urls: string[] } | null>(null)
  const [emailRecipients, setEmailRecipients] = useState<{ id: string; label: string; email: string }[]>([])
  const [emailToId, setEmailToId] = useState('')
  const [emailOther, setEmailOther] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null)

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
        // Auto-expand only the most recent day; collapse everything else
        if (Array.isArray(data) && data.length > 0) {
          const mostRecent = data.reduce((a: DayReport, b: DayReport) => a.date > b.date ? a : b)
          setExpandedDates(new Set([mostRecent.date]))
        }
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

  const toggleScans = (date: string) => {
    const newExpanded = new Set(expandedScans)
    if (newExpanded.has(date)) {
      newExpanded.delete(date)
    } else {
      newExpanded.add(date)
    }
    setExpandedScans(newExpanded)
  }

  const refreshDayReports = () => fetchDayReports()

  const toAbsoluteUrl = (url: string) =>
    url.startsWith('http') ? url : (typeof window !== 'undefined' ? `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}` : url)

  const openEmailModal = (date: string, scanType: 'deposit' | 'debit', urlOrUrls: string | string[]) => {
    const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls]
    const links = urls.map(toAbsoluteUrl)
    const singular = scanType === 'deposit' ? 'deposit' : 'debit'
    const plural = scanType === 'deposit' ? 'deposit' : 'debit'
    const subject = links.length > 1
      ? `${scanType === 'deposit' ? 'Deposit' : 'Debit'} Scans - ${date} (${links.length} files)`
      : `${scanType === 'deposit' ? 'Deposit' : 'Debit'} Scan - ${date}`
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
      {/* Built-in PDF viewer modal — centered window, no page load */}
      {pdfViewerUrl && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
              <span className="text-sm font-medium text-gray-700">PDF viewer</span>
              <div className="flex items-center gap-2">
                <a
                  href={pdfViewerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => setPdfViewerUrl(null)}
                  className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium text-gray-800"
                >
                  Close
                </button>
              </div>
            </div>
            <iframe
              src={pdfViewerUrl}
              title="PDF document"
              className="w-full flex-1 min-h-[60vh] border-0"
            />
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
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-lg">{isExpanded ? '▼' : '▶'}</span>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">{dayReport.date}</h2>
                          <div className="mt-1 flex flex-wrap gap-3 items-center">
                            {getStatusBadge(dayReport.status)}
                            <span className="text-sm text-gray-600">
                              {dayReport.dayType} Day • {dayReport.shifts.length} shift(s)
                            </span>
                            {!isExpanded && (
                              <span className="text-sm text-gray-500">
                                O/S:&nbsp;
                                <span className={`font-semibold ${
                                  dayReport.totals.overShortTotal > 0 ? 'text-green-600' :
                                  dayReport.totals.overShortTotal < 0 ? 'text-red-600' : 'text-gray-700'
                                }`}>
                                  {formatCurrency(dayReport.totals.overShortTotal)}
                                </span>
                                &nbsp;· Deposits:&nbsp;
                                <span className="font-semibold text-gray-700">{formatCurrency(dayReport.totals.totalDeposits)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); exportToExcel(dayReport) }}
                        className="px-4 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700"
                      >
                        Export Excel
                      </button>
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
                        <p className={`text-lg font-bold ${
                          dayReport.totals.overShortTotal > 0 ? 'text-green-600' : 
                          dayReport.totals.overShortTotal < 0 ? 'text-red-600' : 'text-gray-900'
                        }`}>
                          {formatCurrency(dayReport.totals.overShortTotal)}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-600">Total Deposits</p>
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
                      <div>
                        <p className="text-sm text-gray-600">Total Credit</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(dayReport.totals.totalCredit)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Debit</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(dayReport.totals.totalDebit)}</p>
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
                  
                  {/* Document Scans */}
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-semibold text-gray-900">
                        Document Scans
                        {(dayReport.depositScans.length > 0 || dayReport.debitScans.length > 0) && (
                          <span className="ml-2 text-sm font-normal text-gray-500">
                            ({dayReport.depositScans.length + dayReport.debitScans.length} total)
                          </span>
                        )}
                      </h3>
                      <button
                        onClick={() => toggleScans(dayReport.date)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {expandedScans.has(dayReport.date) ? '▼ Collapse' : '▶ Expand'}
                      </button>
                    </div>
                    
                    {expandedScans.has(dayReport.date) && (
                      <div className="space-y-4">
                        {/* Upload Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <DayFileUpload
                            date={dayReport.date}
                            type="deposit"
                            currentUrls={dayReport.depositScans}
                            onUploadComplete={refreshDayReports}
                          />
                          <DayFileUpload
                            date={dayReport.date}
                            type="debit"
                            currentUrls={dayReport.debitScans}
                            onUploadComplete={refreshDayReports}
                          />
                        </div>
                        
                        {/* Display existing scans */}
                        {(dayReport.depositScans.length > 0 || dayReport.debitScans.length > 0) && (
                          <div className="space-y-4 mt-4">
                            {dayReport.depositScans.length > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium text-gray-700">
                                    📄 Deposit Scans ({dayReport.depositScans.length})
                                  </h4>
                                  <button
                                    onClick={() => openEmailModal(dayReport.date, 'deposit', dayReport.depositScans)}
                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                    title="Email all deposit scans"
                                  >
                                    ✉ Email all
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {dayReport.depositScans.map((url, index) => {
                                    const isPdf = url.toLowerCase().endsWith('.pdf')
                                    return (
                                    <div
                                      key={index}
                                      className="relative bg-gray-50 rounded-lg border border-gray-200 p-2"
                                    >
                                      {isPdf ? (
                                        <button
                                          type="button"
                                          onClick={() => setPdfViewerUrl(url)}
                                          className="block w-full text-center py-3 cursor-pointer hover:bg-gray-100 rounded transition-colors"
                                          title="View PDF"
                                        >
                                          <div className="text-3xl mb-1">📄</div>
                                          <div className="text-xs text-gray-600">PDF — click to view</div>
                                        </button>
                                      ) : (
                                        <a
                                          href={url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block"
                                        >
                                          <img
                                            src={url}
                                            alt={`Deposit scan ${index + 1}`}
                                            className="w-full h-24 object-contain rounded bg-white"
                                          />
                                        </a>
                                      )}
                                      {/* Delete button */}
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation?.()
                                          const confirmed = window.confirm('Delete this deposit scan? This cannot be undone.')
                                          if (!confirmed) return
                                          try {
                                            const res = await fetch(`/api/days/${dayReport.date}/upload`, {
                                              method: 'DELETE',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ url, type: 'deposit' })
                                            })
                                            if (res.ok) {
                                              refreshDayReports()
                                            } else {
                                              const err = await res.json().catch(() => ({}))
                                              alert(err.error || 'Failed to delete scan')
                                            }
                                          } catch (err) {
                                            console.error('Error deleting scan', err)
                                            alert('Failed to delete scan')
                                          }
                                        }}
                                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                        aria-label="Delete"
                                        title="Delete this file"
                                      >
                                        ✕
                                      </button>
                                      {/* Email button — sends via API. (Future: add WhatsApp share button with same link.) */}
                                      <button
                                        onClick={() => openEmailModal(dayReport.date, 'deposit', url)}
                                        className="absolute bottom-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-blue-600"
                                        aria-label="Email"
                                        title="Email this file"
                                      >
                                        ✉
                                      </button>
                                    </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                            {dayReport.debitScans.length > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium text-gray-700">
                                    💳 Debit Scans ({dayReport.debitScans.length})
                                  </h4>
                                  <button
                                    onClick={() => openEmailModal(dayReport.date, 'debit', dayReport.debitScans)}
                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                    title="Email all debit scans"
                                  >
                                    ✉ Email all
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {dayReport.debitScans.map((url, index) => {
                                    const isPdf = url.toLowerCase().endsWith('.pdf')
                                    return (
                                    <div
                                      key={index}
                                      className="relative bg-gray-50 rounded-lg border border-gray-200 p-2"
                                    >
                                      {isPdf ? (
                                        <button
                                          type="button"
                                          onClick={() => setPdfViewerUrl(url)}
                                          className="block w-full text-center py-3 cursor-pointer hover:bg-gray-100 rounded transition-colors"
                                          title="View PDF"
                                        >
                                          <div className="text-3xl mb-1">📄</div>
                                          <div className="text-xs text-gray-600">PDF — click to view</div>
                                        </button>
                                      ) : (
                                        <a
                                          href={url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block"
                                        >
                                          <img
                                            src={url}
                                            alt={`Debit scan ${index + 1}`}
                                            className="w-full h-24 object-contain rounded bg-white"
                                          />
                                        </a>
                                      )}
                                      {/* Delete button */}
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation?.()
                                          const confirmed = window.confirm('Delete this debit scan? This cannot be undone.')
                                          if (!confirmed) return
                                          try {
                                            const res = await fetch(`/api/days/${dayReport.date}/upload`, {
                                              method: 'DELETE',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ url, type: 'debit' })
                                            })
                                            if (res.ok) {
                                              refreshDayReports()
                                            } else {
                                              const err = await res.json().catch(() => ({}))
                                              alert(err.error || 'Failed to delete scan')
                                            }
                                          } catch (err) {
                                            console.error('Error deleting scan', err)
                                            alert('Failed to delete scan')
                                          }
                                        }}
                                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                        aria-label="Delete"
                                        title="Delete this file"
                                      >
                                        ✕
                                      </button>
                                      {/* Email button — sends via API. (Future: add WhatsApp share button with same link.) */}
                                      <button
                                        onClick={() => openEmailModal(dayReport.date, 'debit', url)}
                                        className="absolute bottom-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-blue-600"
                                        aria-label="Email"
                                        title="Email this file"
                                      >
                                        ✉
                                      </button>
                                    </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
                                <span className={`font-semibold ${
                                  shift.overShortTotal > 0 ? 'text-green-600' :
                                  shift.overShortTotal < 0 ? 'text-red-600' : 'text-gray-900'
                                }`}>
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
        const dayReport = dayReports.find(r => r.date === showDepositBreakdown)
        if (!dayReport) return null
        
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-50 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border-2 border-gray-300">
              <div className="sticky top-0 bg-gray-50 border-b-2 border-gray-300 px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">
                  Deposit Breakdown - {dayReport.date}
                </h3>
                <button
                  onClick={() => setShowDepositBreakdown(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              
              <div className="p-6">
                <div className="space-y-6">
                  {dayReport.shifts.map((shift) => {
                    const deposits = Array.isArray(shift.deposits) ? shift.deposits : []
                    const hasDeposits = deposits.length > 0 && deposits.some((d: number) => d > 0)
                    
                    if (!hasDeposits) {
                      return (
                        <div key={shift.id} className="border-b-2 border-gray-300 pb-4">
                          <div className="flex justify-between items-center mb-2">
                            <div>
                              <span className="font-semibold text-gray-900">{shift.shift} Shift</span>
                              <span className="ml-2 text-sm text-gray-600">• {shift.supervisor}</span>
                            </div>
                            <span className="text-sm text-gray-400">No deposits</span>
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                      <div key={shift.id} className="border-b-2 border-gray-300 pb-4 last:border-b-0">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <span className="font-semibold text-gray-900">{shift.shift} Shift</span>
                            <span className="ml-2 text-sm text-gray-600">• {shift.supervisor}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-700">
                            Subtotal: {formatCurrency(shift.totalDeposits || 0)}
                          </span>
                        </div>
                        <div className="ml-4 space-y-1">
                          {deposits.map((deposit: number, index: number) => {
                            if (deposit <= 0) return null
                            return (
                              <div key={index} className="flex justify-between items-center text-sm">
                                <span className="text-gray-600">Deposit {index + 1}:</span>
                                <span className="font-medium text-gray-900">{formatCurrency(deposit)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <div className="mt-6 pt-4 border-t-2 border-gray-400">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900">Grand Total:</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(dayReport.totals.totalDeposits)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

