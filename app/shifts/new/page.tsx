'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ShiftType, ShiftCloseInput, ShiftStatus } from '@/lib/types'
import { calculateShiftClose, getMissingFields, canCloseShift } from '@/lib/calculations'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { compareShiftSupervisorCandidates, isShiftSupervisorCandidate } from '@/lib/staff-role'
import { MAX_DEPOSIT_BAGS, normalizeBagNumbers } from '@/lib/deposit-comparison-rows'
import ShiftCountSystemGrid from '../ShiftCountSystemGrid'
import { buildCountSystemRows } from '@/lib/shift-count-system-rows'

const DRAFT_STORAGE_KEY = 'shift-close-draft'

export default function NewShiftPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    date: businessTodayYmd(),
    shift: '6-1' as ShiftType,
    supervisor: '',
    status: 'closed' as ShiftStatus,
    systemCash: 0,
    systemChecks: 0,
    systemCredit: 0,
    systemDebit: 0,
    otherCredit: 0,
    systemInhouse: 0,
    systemFleet: 0,
    systemMassyCoupons: 0,
    countCash: 0,
    countChecks: 0,
    countCredit: 0,
    countInhouse: 0,
    countFleet: 0,
    countMassyCoupons: 0,
    unleaded: 0,
    diesel: 0,
    deposits: [0],
    depositBagNumbers: [''],
    notes: '',
    depositScanUrls: [] as string[],
    debitScanUrls: [] as string[],
    hasMissingHardCopyData: false,
    missingDataNotes: '',
    overShortExplained: false
  })
  const [hasDraft, setHasDraft] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [submitMode, setSubmitMode] = useState<ShiftStatus>('closed')
  const [existingShifts, setExistingShifts] = useState<Map<string, Set<string>>>(new Map())
  // Map structure: date -> Set of shift types that exist for that date
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [supervisorId, setSupervisorId] = useState<string>('')
  
  // Load supervisorId from draft if exists
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft)
        if (draft.supervisorId) {
          setSupervisorId(draft.supervisorId)
        }
      } catch {}
    }
  }, [])
  
  // Load draft from localStorage on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft)
        setFormData({
          ...draft,
          depositBagNumbers: Array.isArray(draft.depositBagNumbers)
            ? draft.depositBagNumbers.length > 0
              ? draft.depositBagNumbers
              : ['']
            : ['']
        })
        setHasDraft(true)
      } catch (error) {
        console.error('Error loading draft:', error)
      }
    }
  }, [])
  
  // Fetch staff list
  useEffect(() => {
    fetch('/api/staff')
      .then(res => res.json())
      .then(data => {
        const activeStaff = data
          .filter((s: any) => isShiftSupervisorCandidate(s))
          .sort(compareShiftSupervisorCandidates)
        setStaffList(activeStaff)
      })
      .catch(err => {
        console.error('Error fetching staff:', err)
      })
  }, [])

  // Fetch existing shifts for the selected date only (duplicate date+shift guard).
  useEffect(() => {
    const date = formData.date
    if (!date) return
    let cancelled = false
    fetch(`/api/shifts?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return
        const types = new Set<string>()
        data.forEach((shift: { shift: string }) => {
          types.add(shift.shift)
        })
        setExistingShifts((prev) => {
          const next = new Map(prev)
          next.set(date, types)
          return next
        })
      })
      .catch((err) => {
        console.error('Error fetching existing shifts:', err)
      })
    return () => {
      cancelled = true
    }
  }, [formData.date])
  
  // Auto-save draft to localStorage whenever formData changes
  useEffect(() => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Set new timeout to save after 500ms of no changes
    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...formData, supervisorId }))
      setHasDraft(true)
    }, 500)
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [formData])
  
  const calculated = calculateShiftClose(formData)
  const countSystemGrid = useMemo(
    () =>
      buildCountSystemRows(formData, {
        overShortCash: calculated.overShortCash,
        checksOverShort: (calculated.overShortTotal || 0) - (calculated.overShortCash || 0),
        overShortTotal: calculated.overShortTotal
      }),
    [formData, calculated.overShortCash, calculated.overShortTotal]
  )
  const hasRedFlag = calculated.hasRedFlag
  
  // Check if shift can be closed (validation)
  const validation = canCloseShift({
    ...formData,
    deposits: formData.deposits,
    overShortTotal: calculated.overShortTotal
  })
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaveError(null)
      // Helper to convert NaN to 0 for submission
      const safeNum = (val: number): number => (Number.isNaN(val) ? 0 : val)
      
      // Only send valid fields to prevent any extra data from being sent
      // If trying to close (not draft), validate first
      if (submitMode === 'closed' && !validation.canClose) {
        setSaveError(`Cannot close shift: ${validation.missingFields.join(', ')}${validation.requiresNotes ? '. Notes required when Over/Short is not zero.' : ''}`)
        return
      }
      
      const validData: ShiftCloseInput = {
        date: formData.date,
        shift: formData.shift,
        supervisor: formData.supervisor,
        status: submitMode,
        systemCash: safeNum(formData.systemCash),
        systemChecks: safeNum(formData.systemChecks),
        systemCredit: safeNum(formData.systemCredit),
        systemDebit: safeNum(formData.systemDebit),
        otherCredit: safeNum(formData.otherCredit),
        systemInhouse: safeNum(formData.systemInhouse),
        systemFleet: safeNum(formData.systemFleet),
        systemMassyCoupons: safeNum(formData.systemMassyCoupons),
        countCash: safeNum(formData.countCash),
        countChecks: safeNum(formData.countChecks),
        countCredit: safeNum(formData.countCredit),
        countInhouse: safeNum(formData.countInhouse),
        countFleet: safeNum(formData.countFleet),
        countMassyCoupons: safeNum(formData.countMassyCoupons),
        unleaded: safeNum(formData.unleaded),
        diesel: safeNum(formData.diesel),
        deposits: formData.deposits
          .map(d => safeNum(d))
          .filter(d => d > 0), // Remove 0 values (empty/placeholder deposits)
        depositBagNumbers: normalizeBagNumbers(formData.depositBagNumbers),
        notes: formData.notes,
        depositScanUrls: formData.depositScanUrls,
        debitScanUrls: formData.debitScanUrls,
        hasMissingHardCopyData: formData.hasMissingHardCopyData,
        missingDataNotes: formData.missingDataNotes,
        overShortExplained: formData.overShortExplained
      }
      
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData)
      })
      if (res.ok) {
        // Clear draft on successful save
        localStorage.removeItem(DRAFT_STORAGE_KEY)
        setHasDraft(false)
        router.push('/shifts')
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Save error:', errorData)
        const message = `Failed to save shift: ${errorData.error || 'Unknown error'}`
        setSaveError(message)
      }
    } catch (error) {
      console.error('Error saving shift:', error)
      const message = `Failed to save shift: ${error instanceof Error ? error.message : 'Unknown error'}`
      setSaveError(message)
    }
  }
  
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setHasDraft(false)
    // Reset form to defaults
    setFormData({
      date: businessTodayYmd(),
      shift: '6-1' as ShiftType,
      supervisor: '',
      status: 'closed' as ShiftStatus,
      systemCash: 0,
      systemChecks: 0,
      systemCredit: 0,
      systemDebit: 0,
      otherCredit: 0,
      systemInhouse: 0,
      systemFleet: 0,
      systemMassyCoupons: 0,
      countCash: 0,
      countChecks: 0,
      countCredit: 0,
      countInhouse: 0,
      countFleet: 0,
      countMassyCoupons: 0,
      unleaded: 0,
      diesel: 0,
      deposits: [0],
      depositBagNumbers: [''],
      notes: '',
      depositScanUrls: [],
      debitScanUrls: [],
      hasMissingHardCopyData: false,
      missingDataNotes: '',
      overShortExplained: false
    })
  }
  
  const addDeposit = () => {
    if (formData.deposits.length < 6) {
      setFormData({ ...formData, deposits: [...formData.deposits, 0] })
    }
  }
  
  const removeDeposit = (index: number) => {
    setFormData({
      ...formData,
      deposits: formData.deposits.filter((_, i) => i !== index)
    })
  }

  const addBag = () => {
    if (formData.depositBagNumbers.length < MAX_DEPOSIT_BAGS) {
      setFormData({ ...formData, depositBagNumbers: [...formData.depositBagNumbers, ''] })
    }
  }

  const removeBag = (index: number) => {
    const next = formData.depositBagNumbers.filter((_, i) => i !== index)
    setFormData({
      ...formData,
      depositBagNumbers: next.length > 0 ? next : ['']
    })
  }

  const updateBag = (index: number, value: string) => {
    const next = [...formData.depositBagNumbers]
    next[index] = value
    setFormData({ ...formData, depositBagNumbers: next })
  }
  
  const updateDeposit = (index: number, value: number | typeof Number.NaN) => {
    const newDeposits = [...formData.deposits]
    newDeposits[index] = Number.isNaN(value) ? (Number.NaN as any) : value
    setFormData({ ...formData, deposits: newDeposits })
  }
  
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-4xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">END OF SHIFT</h1>
          {hasDraft && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">💾 Draft saved</span>
              <button
                type="button"
                onClick={clearDraft}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Clear draft
              </button>
            </div>
          )}
        </div>
        
        {hasRedFlag && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-500 rounded">
            <p className="text-yellow-900 font-bold text-lg">
              ⚠️ Needs Review: Over/Short is not zero and has not been explained.
            </p>
          </div>
        )}

        {saveError && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 rounded text-sm text-red-900">
            <p className="font-semibold mb-2">Failed to save shift.</p>
            <textarea
              readOnly
              className="w-full border border-red-300 rounded px-2 py-1 text-xs bg-white"
              rows={6}
              value={saveError}
            />
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => {
                  const selectedDate = e.target.value
                  const selectedShift = formData.shift
                  
                  // Check if this date+shift combination already exists
                  const existingShiftsForDate = existingShifts.get(selectedDate)
                  if (existingShiftsForDate && existingShiftsForDate.has(selectedShift)) {
                    alert(`A ${selectedShift} shift already exists for ${selectedDate}. Please select a different date or shift type.`)
                    return
                  }
                  
                  setFormData({ ...formData, date: selectedDate })
                }}
                className="w-full border border-gray-300 rounded px-3 py-2"
                required
              />
              {(() => {
                const existingShiftsForDate = existingShifts.get(formData.date)
                const hasConflict = existingShiftsForDate && existingShiftsForDate.has(formData.shift)
                return hasConflict ? (
                  <p className="text-xs text-red-600 mt-1">
                    ⚠️ A {formData.shift} shift already exists for this date
                  </p>
                ) : null
              })()}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
              <select
                value={formData.shift}
                onChange={(e) => {
                  const selectedShift = e.target.value as ShiftType
                  const selectedDate = formData.date
                  
                  // Check if this date+shift combination already exists
                  const existingShiftsForDate = existingShifts.get(selectedDate)
                  if (existingShiftsForDate && existingShiftsForDate.has(selectedShift)) {
                    alert(`A ${selectedShift} shift already exists for ${selectedDate}. Please select a different date or shift type.`)
                    return
                  }
                  
                  setFormData({ ...formData, shift: selectedShift })
                }}
                className="w-full border border-gray-300 rounded px-3 py-2"
                required
              >
                <option value="6-1">6-1</option>
                <option value="1-9">1-9</option>
                <option value="7:30 - 2">7:30 - 2</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
              <select
                value={supervisorId}
                onChange={(e) => {
                  const selectedId = e.target.value
                  setSupervisorId(selectedId)
                  const selectedStaff = staffList.find(s => s.id === selectedId)
                  setFormData({ ...formData, supervisor: selectedStaff?.name || '' })
                }}
                className="w-full border border-gray-300 rounded px-3 py-2"
                required
              >
                <option value="">Select supervisor</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} ({staff.role})
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <ShiftCountSystemGrid
            rows={countSystemGrid.rows}
            summary={countSystemGrid.summary}
            editable
            onFieldChange={(field, value) => setFormData({ ...formData, [field]: value })}
          />
          
          {/* Two Column Layout */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Left: Deposits */}
            <div>
              <h3 className="bg-blue-100 px-4 py-2 font-semibold mb-2">Deposits</h3>
              {formData.deposits.map((deposit, index) => (
                <div key={index} className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <label className="min-w-[100px] bg-blue-200 px-4 py-2">Deposit {index + 1}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={Number.isNaN(deposit) ? '' : deposit}
                    onChange={(e) => {
                      const v = e.target.value
                      const n = parseFloat(v)
                      updateDeposit(index, v === '' || Number.isNaN(n) ? (Number.NaN as any) : n)
                    }}
                    className="w-full flex-1 border border-gray-300 rounded px-3 py-2 text-right"
                    placeholder="Enter amount"
                  />
                  {formData.deposits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDeposit(index)}
                      className="px-3 py-2 bg-red-500 text-white rounded sm:shrink-0"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {formData.deposits.length < 6 && (
                <button
                  type="button"
                  onClick={addDeposit}
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
                >
                  + Add Deposit
                </button>
              )}
              <div className="mt-2">
                <label className="bg-blue-600 text-white px-4 py-2 font-semibold block">Total Deposit</label>
                <div className="border border-gray-300 px-4 py-2 text-right font-semibold">
                  {calculated.totalDeposits.toFixed(2)}
                </div>
              </div>

              <div className="mt-4">
                <h3 className="bg-slate-100 px-4 py-2 font-semibold mb-1">Night deposit bags</h3>
                <p className="text-xs text-slate-500 mb-2 px-1">
                  Optional. Usually one bag for the shift; add a second when needed. Applies to all deposits above.
                </p>
                {formData.depositBagNumbers.map((bag, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <label className="bg-slate-200 px-4 py-2 min-w-[100px]">Bag {index + 1}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={bag}
                      onChange={(e) => updateBag(index, e.target.value)}
                      className="flex-1 border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                      placeholder="Bag number (optional)"
                    />
                    {formData.depositBagNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBag(index)}
                        className="px-3 py-2 bg-red-500 text-white rounded"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {formData.depositBagNumbers.length < MAX_DEPOSIT_BAGS && (
                  <button
                    type="button"
                    onClick={addBag}
                    className="mt-1 px-4 py-2 bg-slate-500 text-white rounded text-sm"
                  >
                    + Add bag
                  </button>
                )}
              </div>
            </div>
            
            {/* Right: Other Items */}
            <div>
              <div className="mb-4">
                <label className="bg-purple-500 text-white px-4 py-2 font-semibold block mb-2">Credit</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.otherCredit === 0 ? 0 : (Number.isNaN(formData.otherCredit) ? '' : formData.otherCredit)}
                  onChange={(e) => {
                    const v = e.target.value
                    const n = parseFloat(v)
                    setFormData({
                      ...formData,
                      otherCredit: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n
                    })
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div className="mb-4">
                <label className="bg-blue-500 text-white px-4 py-2 font-semibold block mb-2">Debit</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.systemDebit === 0 ? 0 : (Number.isNaN(formData.systemDebit) ? '' : formData.systemDebit)}
                  onChange={(e) => {
                    const v = e.target.value
                    const n = parseFloat(v)
                    setFormData({
                      ...formData,
                      systemDebit: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n
                    })
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div className="mb-4">
                <label className="bg-green-300 px-4 py-2 font-semibold block mb-2">Unleaded</label>
                <input
                  type="number"
                  step="0.01"
                  value={Number.isNaN(formData.unleaded) ? '' : formData.unleaded}
                  onChange={(e) => {
                    const v = e.target.value
                    const n = parseFloat(v)
                    setFormData({
                      ...formData,
                      unleaded: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n
                    })
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div className="mb-4">
                <label className="bg-green-600 text-white px-4 py-2 font-semibold block mb-2">Diesel</label>
                <input
                  type="number"
                  step="0.01"
                  value={Number.isNaN(formData.diesel) ? '' : formData.diesel}
                  onChange={(e) => {
                    const v = e.target.value
                    const n = parseFloat(v)
                    setFormData({
                      ...formData,
                      diesel: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n
                    })
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
            </div>
          </div>
          
          {/* Notes */}
          <div>
            <label className="bg-blue-100 px-4 py-2 font-semibold block mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 min-h-[100px]"
              placeholder="Add any notes about this shift (optional)"
            />
          </div>
          
          {/* Missing Data & Over/Short Explanation */}
          <div className="space-y-4 mt-6">
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={formData.hasMissingHardCopyData}
                  onChange={(e) => setFormData({ ...formData, hasMissingHardCopyData: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="font-semibold text-gray-700">Missing hard copy data</span>
              </label>
              {formData.hasMissingHardCopyData && (
                <textarea
                  value={formData.missingDataNotes}
                  onChange={(e) => setFormData({ ...formData, missingDataNotes: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 min-h-[80px] mt-2"
                  placeholder="Describe what data is missing from the hard copy..."
                />
              )}
            </div>
            
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.overShortExplained}
                  onChange={(e) => setFormData({ ...formData, overShortExplained: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="font-semibold text-gray-700">Over/Short discrepancy has been explained</span>
              </label>
            </div>
            
            {/* Auto-detected missing fields warning */}
            {(() => {
              const missing = getMissingFields({
                ...formData,
                deposits: formData.deposits
              })
              if (missing.length > 0) {
                return (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-sm font-semibold text-yellow-800 mb-1">⚠️ Auto-detected missing fields:</p>
                    <p className="text-xs text-yellow-700">{missing.join(', ')}</p>
                  </div>
                )
              }
              return null
            })()}
          </div>
          
          {/* File Uploads - Moved to Day Reports */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>Note:</strong> Document scans (deposit and debit) are now managed at the End of Day level.
              You can upload them after closing the shift on the End of Day page.
            </p>
          </div>
          
          {/* Validation Errors */}
          {submitMode === 'closed' && !validation.canClose && (
            <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
              <p className="text-sm font-semibold text-red-800 mb-2">⚠️ Cannot close shift - missing required fields:</p>
              <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                {validation.missingFields.map((field, idx) => (
                  <li key={idx}>{field}</li>
                ))}
                {validation.requiresNotes && (
                  <li>Notes are required when Over/Short is not zero</li>
                )}
              </ul>
            </div>
          )}
          
          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="submit"
              onClick={() => setSubmitMode('draft')}
              className="px-6 py-2 bg-yellow-500 text-white rounded font-semibold hover:bg-yellow-600"
            >
              Save as Draft
            </button>
            <button
              type="submit"
              onClick={() => setSubmitMode('closed')}
              disabled={!validation.canClose}
              className={`px-6 py-2 rounded font-semibold ${
                validation.canClose
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-400 text-gray-200 cursor-not-allowed'
              }`}
              title={!validation.canClose ? 'Complete all fields to close shift' : 'Save and close shift'}
            >
              Save Shift
            </button>
            <button
              type="button"
              onClick={() => router.push('/shifts')}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

