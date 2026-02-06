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
  const [showReportsDropdown, setShowReportsDropdown] = useState(false)
  const reportsDropdownRef = useRef<HTMLDivElement>(null)
  const [showDepositBreakdown, setShowDepositBreakdown] = useState<string | null>(null) // date of the day report to show breakdown for

  // Close custom picker and reports dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customPickerRef.current && !customPickerRef.current.contains(event.target as Node)) {
        setShowCustomPicker(false)
      }
      if (reportsDropdownRef.current && !reportsDropdownRef.current.contains(event.target as Node)) {
        setShowReportsDropdown(false)
      }
    }

    if (showCustomPicker || showReportsDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCustomPicker, showReportsDropdown])
  
  useEffect(() => {
    fetch('/api/days')
      .then(res => res.json())
      .then(data => {
        setDayReports(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching day reports:', err)
        setLoading(false)
      })
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

  const refreshDayReports = () => {
    fetch('/api/days')
      .then(res => res.json())
      .then(data => {
        setDayReports(data)
      })
      .catch(err => {
        console.error('Error fetching day reports:', err)
      })
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
      ['Day Report'],
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
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-gray-900">Day Reports</h1>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/settings')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
              title="Settings"
            >
              ⚙️
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              Dashboard
            </button>
            <div className="relative" ref={reportsDropdownRef}>
              <button
                onClick={() => setShowReportsDropdown(!showReportsDropdown)}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 flex items-center gap-1"
              >
                Reports
                <span className="text-xs">▼</span>
              </button>
              {showReportsDropdown && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl z-50 min-w-[180px]">
                  <button
                    onClick={() => {
                      router.push('/reports')
                      setShowReportsDropdown(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-t-lg"
                  >
                    Reports Center
                  </button>
                  <button
                    onClick={() => {
                      router.push('/customer-accounts')
                      setShowReportsDropdown(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-b-lg"
                  >
                    Customer Accounts
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => router.push('/staff')}
              className="px-4 py-2 bg-purple-600 text-white rounded font-semibold hover:bg-purple-700"
            >
              Staff
            </button>
            <button
              onClick={() => router.push('/fuel-payments')}
              className="px-4 py-2 bg-orange-600 text-white rounded font-semibold hover:bg-orange-700"
            >
              Fuel Payments
            </button>
            <button
              onClick={() => router.push('/shifts')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold"
            >
              Back to Shifts
            </button>
          </div>
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
              ({filteredReports.length} day report{filteredReports.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        
        {dayReports.length === 0 ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded p-8 text-center text-gray-500">
            No day reports found. Create shifts to generate day reports.
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded p-8 text-center text-gray-500">
            No day reports found for the selected filter.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((dayReport) => {
              const isExpanded = expandedDates.has(dayReport.date)
              
              return (
                <div key={dayReport.date} className="bg-white shadow-sm border border-gray-200 rounded">
                  {/* Header */}
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{dayReport.date}</h2>
                        <div className="mt-2 flex gap-4 items-center">
                          {getStatusBadge(dayReport.status)}
                          <span className="text-sm text-gray-600">
                            {dayReport.dayType} Day • {dayReport.shifts.length} shift(s)
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => exportToExcel(dayReport)}
                          className="px-4 py-2 bg-green-600 text-white rounded text-sm font-semibold"
                        >
                          Export Excel
                        </button>
                        <button
                          onClick={() => toggleExpand(dayReport.date)}
                          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold"
                        >
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Shift Breakdown */}
                  {isExpanded && (
                    <div className="p-4 border-b border-gray-200">
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
                  )}
                  
                  {/* Money Summary */}
                  <div className="p-4 border-b border-gray-200">
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
                                <h4 className="text-sm font-medium text-gray-700 mb-2">
                                  📄 Deposit Scans ({dayReport.depositScans.length})
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {dayReport.depositScans.map((url, index) => (
                                    <div
                                      key={index}
                                      className="relative bg-gray-50 rounded-lg border border-gray-200 p-2"
                                    >
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                      >
                                        {url.toLowerCase().endsWith('.pdf') ? (
                                          <div className="text-center py-3">
                                            <div className="text-3xl mb-1">📄</div>
                                            <div className="text-xs text-gray-600">PDF</div>
                                          </div>
                                        ) : (
                                          <img
                                            src={url}
                                            alt={`Deposit scan ${index + 1}`}
                                            className="w-full h-24 object-contain rounded bg-white"
                                          />
                                        )}
                                      </a>
                                      {/* Delete button */}
                                      <button
                                        onClick={async () => {
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
                                          } catch (e) {
                                            console.error('Error deleting scan', e)
                                            alert('Failed to delete scan')
                                          }
                                        }}
                                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                        aria-label="Delete"
                                        title="Delete this file"
                                      >
                                        ✕
                                      </button>
                                      {/* Email button */}
                                      <button
                                        onClick={() => {
                                          window.location.href = `mailto:?subject=Deposit Scan - ${dayReport.date}&body=Please find attached deposit scan from ${dayReport.date}.%0D%0A%0D%0AFile: ${url}`
                                        }}
                                        className="absolute bottom-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-blue-600"
                                        aria-label="Email"
                                        title="Email this file"
                                      >
                                        ✉
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {dayReport.debitScans.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-2">
                                  💳 Debit Scans ({dayReport.debitScans.length})
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {dayReport.debitScans.map((url, index) => (
                                    <div
                                      key={index}
                                      className="relative bg-gray-50 rounded-lg border border-gray-200 p-2"
                                    >
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                      >
                                        {url.toLowerCase().endsWith('.pdf') ? (
                                          <div className="text-center py-3">
                                            <div className="text-3xl mb-1">📄</div>
                                            <div className="text-xs text-gray-600">PDF</div>
                                          </div>
                                        ) : (
                                          <img
                                            src={url}
                                            alt={`Debit scan ${index + 1}`}
                                            className="w-full h-24 object-contain rounded bg-white"
                                          />
                                        )}
                                      </a>
                                      {/* Delete button */}
                                      <button
                                        onClick={async () => {
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
                                          } catch (e) {
                                            console.error('Error deleting scan', e)
                                            alert('Failed to delete scan')
                                          }
                                        }}
                                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                        aria-label="Delete"
                                        title="Delete this file"
                                      >
                                        ✕
                                      </button>
                                      {/* Email button */}
                                      <button
                                        onClick={() => {
                                          window.location.href = `mailto:?subject=Debit Scan - ${dayReport.date}&body=Please find attached debit scan from ${dayReport.date}.%0D%0A%0D%0AFile: ${url}`
                                        }}
                                        className="absolute bottom-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-blue-600"
                                        aria-label="Email"
                                        title="Email this file"
                                      >
                                        ✉
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Shift Breakdown */}
                  {isExpanded && (
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

