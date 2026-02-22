'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import CustomDatePicker from '../days/CustomDatePicker'

interface Shift {
  id: string
  date: string
  shift: string
  supervisor: string
  status?: string
  overShortTotal: number | null
  netOverShort?: number | null
  notes: string
  totalDeposits: number | null
  unleaded: number
  diesel: number
  hasDayDebitScans?: boolean
  overShortItems?: Array<{ type: string; amount: number; noteOnly?: boolean }>
}

const OS_THRESHOLD = 20

function getOsColor(amount: number): string {
  if (Math.abs(amount) <= OS_THRESHOLD) return 'text-green-600'
  if (amount > 0) return 'text-blue-600'
  return 'text-red-600'
}

type ShiftFilterType = 'all' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom'

export default function ShiftsPage() {
  const router = useRouter()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearStep, setClearStep] = useState(1)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [clearing, setClearing] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState<string | null>(null) // shift ID to show notes for
  const [activeFilter, setActiveFilter] = useState<ShiftFilterType>('all')
  const [customDate, setCustomDate] = useState<string>('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const customPickerRef = useRef<HTMLDivElement>(null)
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
    fetch('/api/shifts')
      .then(res => res.json())
      .then(data => {
        // Sort by date desc, and for the same date put 1-9 after 6-1 (since it happens later)
        const weight = (shift: string) => {
          if (shift === '6-1') return 1
          if (shift === '1-9') return 2
          return 0
        }
        const sorted = [...data].sort((a: Shift, b: Shift) => {
          if (a.date !== b.date) {
            return a.date > b.date ? -1 : 1
          }
          return weight(b.shift) - weight(a.shift)
        })
        setShifts(sorted)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching shifts:', err)
        setLoading(false)
      })
  }, [])

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date)
    const day = d.getDay() || 7 // Sunday=0 -> 7
    if (day !== 1) {
      d.setDate(d.getDate() - (day - 1))
    }
    d.setHours(0, 0, 0, 0)
    return d
  }

  const getEndOfWeek = (date: Date): Date => {
    const start = getStartOfWeek(date)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return end
  }

  const filteredShifts = useMemo(() => {
    if (activeFilter === 'all') return shifts

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const inRange = (shiftDate: string, start: Date, end: Date) => {
      const startStr = formatDate(start)
      const endStr = formatDate(end)
      return shiftDate >= startStr && shiftDate <= endStr
    }

    if (activeFilter === 'thisWeek') {
      const weekStart = getStartOfWeek(today)
      const weekEnd = getEndOfWeek(today)
      return shifts.filter(s => inRange(s.date, weekStart, weekEnd))
    }

    if (activeFilter === 'lastWeek') {
      const thisWeekStart = getStartOfWeek(today)
      const lastWeekEnd = new Date(thisWeekStart)
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1)
      const lastWeekStart = getStartOfWeek(lastWeekEnd)
      return shifts.filter(s => inRange(s.date, lastWeekStart, lastWeekEnd))
    }

    if (activeFilter === 'thisMonth') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return shifts.filter(s => inRange(s.date, monthStart, monthEnd))
    }

    if (activeFilter === 'lastMonth') {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const monthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      return shifts.filter(s => inRange(s.date, monthStart, monthEnd))
    }

    if (activeFilter === 'custom' && customDate) {
      return shifts.filter(s => s.date === customDate)
    }

    return shifts
  }, [shifts, activeFilter, customDate])

  const handleClearAll = async () => {
    if (clearStep < 3) {
      setClearStep(clearStep + 1)
      return
    }

    // Final step - perform deletion
    if (deleteConfirm !== 'DELETE') {
      return
    }

    setClearing(true)
    try {
      const res = await fetch('/api/admin/clear-all', {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        alert(`Failed to clear data: ${error.error || 'Unknown error'}`)
        return
      }

      // Success - close modal and refresh
      setShowClearModal(false)
      setClearStep(1)
      setDeleteConfirm('')
      setShifts([])
      // Refresh the page to show empty state
      window.location.reload()
    } catch (error) {
      console.error('Error clearing data:', error)
      alert('Failed to clear data. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  const handleCancelClear = () => {
    setShowClearModal(false)
    setClearStep(1)
    setDeleteConfirm('')
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
          <h1 className="text-3xl font-bold text-gray-900">Shift List</h1>
          <button
            onClick={() => router.push('/shifts/new')}
            className="px-6 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
          >
            + New Shift
          </button>
        </div>
        
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
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
              setActiveFilter('lastWeek')
              setShowCustomPicker(false)
            }}
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
              activeFilter === 'lastWeek'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Last Week
          </button>
          <button
            onClick={() => {
              setActiveFilter('thisMonth')
              setShowCustomPicker(false)
            }}
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
              activeFilter === 'thisMonth'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => {
              setActiveFilter('lastMonth')
              setShowCustomPicker(false)
            }}
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
              activeFilter === 'lastMonth'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Last Month
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
              ({filteredShifts.length} shift{filteredShifts.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>

        <div className="bg-white shadow-sm border border-gray-200 rounded overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Shift</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Supervisor</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Over/Short</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Notes</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Unleaded</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Diesel</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Deposit Total</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No shifts found. Create your first shift to get started.
                  </td>
                </tr>
              ) : filteredShifts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No shifts found for the selected filter.
                  </td>
                </tr>
              ) : (
                filteredShifts.map((shift) => {
                  const netOS = shift.netOverShort != null
                    ? shift.netOverShort
                    : shift.overShortTotal || 0
                  const hasNotes = shift.notes.trim() !== ''
                  
                  return (
                    <tr
                      key={shift.id}
                      className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/shifts/${shift.id}`)}
                    >
                      <td className="px-4 py-3 text-gray-900">
                        {shift.date}
                        {(() => {
                          const missingDeposits = !shift.totalDeposits || shift.totalDeposits === 0
                          const missingDebitScans = !shift.hasDayDebitScans
                          
                          // 2 asterisks if both are missing, 1 if only one is missing
                          const missingCount = (missingDeposits ? 1 : 0) + (missingDebitScans ? 1 : 0)
                          
                          if (missingCount === 0) return null
                          
                          let title = ''
                          if (missingDeposits && missingDebitScans) {
                            title = 'Missing deposits and debit scans'
                          } else if (missingDeposits) {
                            title = 'Missing deposits'
                          } else {
                            title = 'Missing debit scans'
                          }
                          
                          return (
                            <span className="ml-2 text-red-600 font-bold" title={title}>
                              {'*'.repeat(missingCount)}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{shift.shift}</td>
                      <td className="px-4 py-3 text-gray-900">{shift.supervisor}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${getOsColor(netOS)}`}>
                        {netOS.toFixed(2)}
                      </td>
                      <td 
                        className="px-4 py-3 text-center"
                        onClick={(e) => {
                          e.stopPropagation() // Prevent row click
                          if (hasNotes) {
                            setShowNotesModal(shift.id)
                          }
                        }}
                      >
                        {hasNotes ? (
                          <button
                            className="text-blue-600 hover:text-blue-800 font-semibold"
                            title="Click to view notes"
                          >
                            ✓
                          </button>
                        ) : (
                          <span className="text-gray-400">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">{shift.unleaded.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{shift.diesel.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{(shift.totalDeposits || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center text-sm">
                        {shift.status === 'draft' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 text-xs font-semibold">
                            Draft
                          </span>
                        ) : shift.status === 'reopened' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-orange-100 text-orange-800 border border-orange-300 text-xs font-semibold">
                            Reopened
                          </span>
                        ) : shift.status === 'reviewed' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-300 text-xs font-semibold">
                            Reviewed
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                            netOS === 0
                              ? 'bg-green-100 text-green-800 border border-green-300'
                              : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                          }`}>
                            {netOS === 0 ? 'OK' : 'Needs review'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TEMPORARY: Clear All Modal - Remove before production */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full border-2 border-red-300">
            <div className="p-6">
              {clearStep === 1 && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-4xl">⚠️</div>
                    <h3 className="text-xl font-bold text-gray-900">Clear All Data</h3>
                  </div>
                  <p className="text-gray-700 mb-6">
                    Are you sure you want to delete <strong>ALL</strong> shifts and data? This action will permanently remove:
                  </p>
                  <ul className="list-disc list-inside text-gray-700 mb-6 space-y-1">
                    <li>All shift records</li>
                    <li>All end of day records</li>
                    <li>All corrections</li>
                    <li>All uploaded files</li>
                  </ul>
                  <div className="flex gap-3">
                    <button
                      onClick={handleCancelClear}
                      className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded font-semibold hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleClearAll}
                      className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded font-semibold hover:bg-yellow-700"
                    >
                      Continue
                    </button>
                  </div>
                </>
              )}

              {clearStep === 2 && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-4xl">🚨</div>
                    <h3 className="text-xl font-bold text-red-600">Second Confirmation</h3>
                  </div>
                  <p className="text-gray-700 mb-4">
                    This action <strong>CANNOT</strong> be undone. All data will be permanently deleted.
                  </p>
                  <p className="text-gray-700 mb-4">
                    Type <strong className="text-red-600">DELETE</strong> in the box below to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="Type DELETE here"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded mb-6 focus:border-red-500 focus:outline-none"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setClearStep(1)
                        setDeleteConfirm('')
                      }}
                      className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded font-semibold hover:bg-gray-400"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleClearAll}
                      disabled={deleteConfirm !== 'DELETE'}
                      className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded font-semibold hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      Proceed
                    </button>
                  </div>
                </>
              )}

              {clearStep === 3 && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-4xl">🔥</div>
                    <h3 className="text-xl font-bold text-red-600">Final Warning</h3>
                  </div>
                  <p className="text-gray-700 mb-2">
                    <strong className="text-red-600">This is your last chance to cancel.</strong>
                  </p>
                  <p className="text-gray-700 mb-6">
                    Clicking "Confirm Delete" will immediately and permanently delete all shifts, end of day records, corrections, and uploaded files. This cannot be reversed.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setClearStep(2)
                      }}
                      className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded font-semibold hover:bg-gray-400"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleClearAll}
                      disabled={clearing || deleteConfirm !== 'DELETE'}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {clearing ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && (() => {
        const shift = shifts.find(s => s.id === showNotesModal)
        if (!shift || !shift.notes.trim()) return null
        
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-50 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border-2 border-gray-300">
              <div className="sticky top-0 bg-gray-50 border-b-2 border-gray-300 px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">
                  Notes - {shift.date} ({shift.shift})
                </h3>
                <button
                  onClick={() => setShowNotesModal(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              
              <div className="p-6">
                <div className="mb-4 text-sm text-gray-600">
                  <span className="font-medium">Supervisor:</span> {shift.supervisor}
                </div>
                <div className="bg-white rounded-lg border-2 border-gray-300 p-4">
                  <p className="text-gray-900 whitespace-pre-wrap">{shift.notes}</p>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

