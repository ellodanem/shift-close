'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getMissingFields, isShiftFullyReviewed } from '@/lib/calculations'
import type { ShiftType } from '@/lib/types'

const DRAFT_STORAGE_KEY = 'shift-draft-edit'

interface Shift {
  id: string
  date: string
  shift: string
  supervisor: string
  status: string
  systemCash: number
  systemChecks: number
  systemCredit: number
  systemDebit: number
  otherCredit: number
  systemInhouse: number
  systemFleet: number
  systemMassyCoupons: number
  countCash: number
  countChecks: number
  countCredit: number
  countInhouse: number
  countFleet: number
  countMassyCoupons: number
  unleaded: number
  diesel: number
  deposits: string
  notes: string
  depositScanUrls: string
  debitScanUrls: string
  overShortCash: number | null
  overShortTotal: number | null
  totalDeposits: number | null
  createdAt: string
  corrections: Array<{
    id: string
    field: string
    oldValue: string
    newValue: string
    reason: string | null
    changedBy: string
    createdAt: string
  }>
  noteHistory?: Array<{
    id: string
    oldNote: string
    newNote: string
    changedBy: string
    createdAt: string
  }>
  hasMissingHardCopyData?: boolean
  missingDataNotes?: string
  overShortExplained?: boolean
  overShortExplanation?: string | null
  overShortItems?: Array<{
    id: string
    type: string
    amount: number
    description: string
    sortOrder: number
  }>
}

export default function ShiftDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [shift, setShift] = useState<Shift | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasMissingHardCopyData, setHasMissingHardCopyData] = useState(false)
  const [missingDataNotes, setMissingDataNotes] = useState('')
  const [overShortExplained, setOverShortExplained] = useState(false)
  const [overShortExplanationDraft, setOverShortExplanationDraft] = useState('')
  const [showOverShortModal, setShowOverShortModal] = useState(false)
  const [showAddOverShortModal, setShowAddOverShortModal] = useState(false)
  const [addOverShortType, setAddOverShortType] = useState<'overage' | 'shortage'>('overage')
  const [addOverShortAmount, setAddOverShortAmount] = useState('')
  const [addOverShortDescription, setAddOverShortDescription] = useState('')
  const [savingOverShortItem, setSavingOverShortItem] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set())
  const [showChangeLog, setShowChangeLog] = useState(false)
  const [showNoteHistory, setShowNoteHistory] = useState(false)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [editedNotes, setEditedNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [supervisorId, setSupervisorId] = useState<string>('')
  // For drafts, use editable state - must be at top level
  const [editData, setEditData] = useState({
    date: '',
    shift: '',
    supervisor: '',
    supervisorId: '',
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
    deposits: [] as number[],
    notes: ''
  })
  
  useEffect(() => {
    if (params.id) {
      fetch(`/api/shifts/${params.id}`)
        .then(res => res.json())
        .then(data => {
          setShift(data)
          setHasMissingHardCopyData(data.hasMissingHardCopyData || false)
          setMissingDataNotes(data.missingDataNotes || '')
          setOverShortExplained(data.overShortExplained || false)
          setOverShortExplanationDraft(data.overShortExplanation || '')
          setOverShortExplanationDraft(data.overShortExplanation || '')
          // Track which fields have been changed
          if (data.corrections && data.corrections.length > 0) {
            const changed = new Set<string>(data.corrections.map((c: any) => c.field as string))
            setChangedFields(changed)
          }
          // Initialize edited notes
          setEditedNotes(data.notes || '')
          // Initialize editData when shift loads
          const deposits = JSON.parse(data.deposits || '[]')
          setEditData({
            date: data.date || '',
            shift: data.shift || '',
            supervisor: data.supervisor || '',
            supervisorId: (data as any).supervisorId || '',
            systemCash: data.systemCash || 0,
            systemChecks: data.systemChecks || 0,
            systemCredit: data.systemCredit || 0,
            systemDebit: data.systemDebit || 0,
            otherCredit: data.otherCredit || 0,
            systemInhouse: data.systemInhouse || 0,
            systemFleet: data.systemFleet || 0,
            systemMassyCoupons: data.systemMassyCoupons || 0,
            countCash: data.countCash || 0,
            countChecks: data.countChecks || 0,
            countCredit: data.countCredit || 0,
            countInhouse: data.countInhouse || 0,
            countFleet: data.countFleet || 0,
            countMassyCoupons: data.countMassyCoupons || 0,
            unleaded: data.unleaded || 0,
            diesel: data.diesel || 0,
            deposits: deposits,
            notes: data.notes || ''
          })
          setSupervisorId((data as any).supervisorId || '')
          setLoading(false)
          
          // Load from localStorage if available (for drafts)
          if (data.status === 'draft') {
            const savedDraft = localStorage.getItem(`${DRAFT_STORAGE_KEY}-${data.id}`)
            if (savedDraft) {
              try {
                const draft = JSON.parse(savedDraft)
                if (draft.id === data.id) {
                  setEditData({
                    date: draft.date || data.date || '',
                    shift: draft.shift || data.shift || '',
                    supervisor: draft.supervisor || data.supervisor || '',
                    supervisorId: draft.supervisorId || (data as any).supervisorId || '',
                    systemCash: draft.systemCash ?? data.systemCash ?? 0,
                    systemChecks: draft.systemChecks ?? data.systemChecks ?? 0,
                    systemCredit: draft.systemCredit ?? data.systemCredit ?? 0,
                    systemDebit: draft.systemDebit ?? data.systemDebit ?? 0,
                    otherCredit: draft.otherCredit ?? data.otherCredit ?? 0,
                    systemInhouse: draft.systemInhouse ?? data.systemInhouse ?? 0,
                    systemFleet: draft.systemFleet ?? data.systemFleet ?? 0,
                    systemMassyCoupons: draft.systemMassyCoupons ?? data.systemMassyCoupons ?? 0,
                    countCash: draft.countCash ?? data.countCash ?? 0,
                    countChecks: draft.countChecks ?? data.countChecks ?? 0,
                    countCredit: draft.countCredit ?? data.countCredit ?? 0,
                    countInhouse: draft.countInhouse ?? data.countInhouse ?? 0,
                    countFleet: draft.countFleet ?? data.countFleet ?? 0,
                    countMassyCoupons: draft.countMassyCoupons ?? data.countMassyCoupons ?? 0,
                    unleaded: draft.unleaded ?? data.unleaded ?? 0,
                    diesel: draft.diesel ?? data.diesel ?? 0,
                    deposits: draft.deposits || deposits,
                    notes: draft.notes ?? data.notes ?? ''
                  })
                  if (draft.hasMissingHardCopyData !== undefined) setHasMissingHardCopyData(draft.hasMissingHardCopyData)
                  if (draft.missingDataNotes !== undefined) setMissingDataNotes(draft.missingDataNotes)
                  if (draft.overShortExplained !== undefined) setOverShortExplained(draft.overShortExplained)
                }
              } catch (error) {
                console.error('Error loading draft from localStorage:', error)
              }
            }
          }
        })
        .catch(err => {
          console.error('Error fetching shift:', err)
          setLoading(false)
        })
    }
  }, [params.id])
  
  const updateCheckbox = async (field: string, value: boolean | string) => {
    try {
      const updatePayload: any = { [field]: value }
      
      // NOTE: overShortExplained is now managed via the Over/Short modal flow, not a direct checkbox
      
      const res = await fetch(`/api/shifts/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      })
      if (res.ok) {
        const updated = await res.json()
        setShift(updated)
        if (updatePayload.status === 'reviewed') {
          // Optionally show a message
          console.log('Shift marked as reviewed - all conditions met')
        } else if (updatePayload.status === 'closed') {
          console.log('Shift status reverted to closed')
        }
      } else {
        const errorData = await res.json().catch(() => ({}))
        console.error('Failed to update checkbox:', errorData)
      }
    } catch (err) {
      console.error('Error updating checkbox:', err)
    }
  }
  
  // Auto-save to localStorage for drafts
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isInitialLoad = useRef(true)
  
  useEffect(() => {
    // Skip auto-save on initial load
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }
    
    // Only auto-save if it's a draft and shift is loaded
    if (!shift || shift.status !== 'draft') return
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Set new timeout to save to localStorage after 500ms of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      const draftData = {
        id: shift.id,
        ...editData,
        supervisorId,
        deposits: editData.deposits,
        hasMissingHardCopyData,
        missingDataNotes,
        overShortExplained
      }
      localStorage.setItem(`${DRAFT_STORAGE_KEY}-${shift.id}`, JSON.stringify(draftData))
    }, 500) // 500ms delay
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [editData, shift?.id, hasMissingHardCopyData, missingDataNotes, overShortExplained])
  
  const deposits = shift ? JSON.parse(shift.deposits) : []
  const hasRedFlag = shift ? ((shift.overShortTotal || 0) !== 0 && !shift.overShortExplained) : false
  const isDraft = shift?.status === 'draft'
  const isReopened = shift?.status === 'reopened'
  // Editable numeric fields when draft OR reopened (reopened edits are fully audited in backend)
  const isEditable = isDraft || isReopened
  // Figure out which deposit indices changed (based on latest deposits correction)
  const changedDepositIndices = useMemo(() => {
    if (!shift || !shift.corrections) return new Set<number>()
    const latestDepositsCorrection = shift.corrections.find((c) => c.field === 'deposits')
    if (!latestDepositsCorrection) return new Set<number>()
    try {
      const oldArr = JSON.parse(latestDepositsCorrection.oldValue || '[]') as number[]
      const newArr = JSON.parse(latestDepositsCorrection.newValue || '[]') as number[]
      const maxLen = Math.max(oldArr.length, newArr.length)
      const indices = new Set<number>()
      for (let i = 0; i < maxLen; i += 1) {
        const oldVal = oldArr[i] ?? 0
        const newVal = newArr[i] ?? 0
        if (oldVal !== newVal) {
          indices.add(i)
        }
      }
      return indices
    } catch {
      return new Set<number>()
    }
  }, [shift?.corrections])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }
  
  if (!shift) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600">Shift not found</p>
          <button
            onClick={() => router.push('/shifts')}
            className="mt-4 px-4 py-2 bg-gray-300 text-gray-700 rounded"
          >
            Back to Shifts
          </button>
        </div>
      </div>
    )
  }

  const handleConfirmOverShortExplanation = async () => {
    if (!shift) return
    try {
      const missingFields = getMissingFields({
        systemCash: shift.systemCash,
        systemChecks: shift.systemChecks,
        systemCredit: shift.systemCredit,
        systemDebit: shift.systemDebit,
        otherCredit: shift.otherCredit,
        systemInhouse: shift.systemInhouse,
        systemFleet: shift.systemFleet,
        systemMassyCoupons: shift.systemMassyCoupons,
        countCash: shift.countCash,
        countChecks: shift.countChecks,
        countCredit: shift.countCredit,
        countInhouse: shift.countInhouse,
        countFleet: shift.countFleet,
        countMassyCoupons: shift.countMassyCoupons,
        unleaded: shift.unleaded,
        diesel: shift.diesel,
        deposits: shift.deposits
      })
      const fullyReviewed = isShiftFullyReviewed({
        overShortTotal: shift.overShortTotal,
        notes: shift.notes,
        hasMissingHardCopyData: shift.hasMissingHardCopyData,
        missingDataNotes: shift.missingDataNotes,
        overShortExplained: true,
        overShortExplanation: overShortExplanationDraft,
        depositScanUrls: shift.depositScanUrls,
        debitScanUrls: shift.debitScanUrls,
        missingFields
      })
      const payload: any = {
        overShortExplained: true,
        overShortExplanation: overShortExplanationDraft
      }
      if (fullyReviewed) {
        payload.status = 'reviewed'
      }
      const res = await fetch(`/api/shifts/${String(params.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        throw new Error('Failed to save over/short explanation')
      }
      const updated = await res.json()
      setShift(updated)
      setOverShortExplained(true)
      setShowOverShortModal(false)
    } catch (err) {
      console.error(err)
      alert('Failed to save over/short explanation')
    }
  }
  
  const handleSaveDraft = async () => {
    try {
      const res = await fetch(`/api/shifts/${shift.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editData,
          supervisorId: supervisorId || null,
          deposits: JSON.stringify(editData.deposits)
        })
      })
      if (res.ok) {
        const updated = await res.json()
        setShift(updated)
        // Clear localStorage after successful save
        localStorage.removeItem(`${DRAFT_STORAGE_KEY}-${shift.id}`)
        alert('Draft saved successfully!')
        router.refresh()
      } else {
        alert('Failed to save draft')
      }
    } catch (err) {
      console.error('Error saving draft:', err)
      alert('Failed to save draft')
    }
  }
  
  // Handle closing shift with confirmation
  const handleCloseShift = () => {
    setShowCloseConfirm(true)
  }
  
  const confirmCloseShift = async () => {
    setShowCloseConfirm(false)
    try {
      // Save the current data and change status to closed
      const res = await fetch(`/api/shifts/${shift.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editData,
          supervisorId: supervisorId || null,
          deposits: JSON.stringify(editData.deposits),
          status: 'closed' // Change status to closed
        })
      })
      if (res.ok) {
        const updated = await res.json()
        setShift(updated)
        // Clear localStorage after successful close
        localStorage.removeItem(`${DRAFT_STORAGE_KEY}-${shift.id}`)
        alert('Shift closed successfully!')
        router.push('/shifts')
      } else {
        alert('Failed to close shift')
      }
    } catch (err) {
      console.error('Error closing shift:', err)
      alert('Failed to close shift')
    }
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Close Confirmation Modal */}
      {showCloseConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Close Shift?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to close this shift? Your data is saved locally, so you can come back later if needed. Once closed, the shift will be marked as complete.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={confirmCloseShift}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Close Shift
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="max-w-4xl mx-auto bg-white shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            END OF SHIFT{" "}
            {isDraft && <span className="text-yellow-600 text-lg">(DRAFT - Editable)</span>}
            {isReopened && !isDraft && (
              <span className="text-orange-600 text-lg ml-2">(REOPENED - Audited Changes)</span>
            )}
          </h1>
          <div className="flex gap-2">
            {isDraft ? (
              <>
                <button
                  onClick={handleSaveDraft}
                  className="px-4 py-2 bg-blue-600 text-white rounded font-semibold"
                >
                  Save Draft
                </button>
                <button
                  onClick={handleCloseShift}
                  className="px-4 py-2 bg-green-600 text-white rounded font-semibold"
                >
                  Close Shift
                </button>
              </>
            ) : isReopened ? (
              <>
                <button
                  onClick={async () => {
                    if (!shift) return
                    try {
                      const res = await fetch(`/api/shifts/${shift.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ...editData,
                          deposits: JSON.stringify(editData.deposits)
                        })
                      })
                      if (res.ok) {
                        const updated = await res.json()
                        setShift(updated)
                        // Refresh changedFields from corrections so highlights show
                        if (updated.corrections) {
                          const changed = new Set<string>(updated.corrections.map((c: any) => c.field as string))
                          setChangedFields(changed)
                        }
                        alert('Changes saved successfully.')
                      } else {
                        alert('Failed to save changes')
                      }
                    } catch (err) {
                      console.error('Error saving reopened shift:', err)
                      alert('Failed to save changes')
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded font-semibold"
                >
                  Save Changes
                </button>
                <button
                  onClick={async () => {
                    if (!shift) return
                    const confirmed = window.confirm('Re-close this shift? Changes will remain audited.')
                    if (!confirmed) return
                    try {
                      // Exclude date and shift from re-close request (they can't be changed)
                      const { date, shift: shiftType, ...recloseData } = editData
                      const res = await fetch(`/api/shifts/${shift.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ...recloseData,
                          supervisorId: supervisorId || null,
                          deposits: JSON.stringify(recloseData.deposits),
                          status: 'closed'
                        })
                      })
                      if (res.ok) {
                        const updated = await res.json()
                        setShift(updated)
                        // Refresh changedFields from corrections so highlights show
                        if (updated.corrections) {
                          const changed = new Set<string>(updated.corrections.map((c: any) => c.field as string))
                          setChangedFields(changed)
                        }
                        alert('Shift re-closed successfully.')
                      } else {
                        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
                        console.error('Failed to re-close shift:', errorData)
                        alert(`Failed to re-close shift: ${errorData.error || 'Unknown error'}`)
                      }
                    } catch (err) {
                      console.error('Error re-closing shift:', err)
                      alert(`Failed to re-close shift: ${err instanceof Error ? err.message : 'Unknown error'}`)
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded font-semibold"
                >
                  Re-close Shift
                </button>
              </>
            ) : (
              // Closed / reviewed shift - allow reopening
              <button
                onClick={async () => {
                  if (!shift) return
                  const confirmed = window.confirm('Reopen this closed shift for audited changes?')
                  if (!confirmed) return
                  try {
                    const res = await fetch(`/api/shifts/${shift.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'reopened' })
                    })
                    if (res.ok) {
                      const updated = await res.json()
                      setShift(updated)
                      alert('Shift reopened for audited changes.')
                    } else {
                      alert('Failed to reopen shift')
                    }
                  } catch (err) {
                    console.error('Error reopening shift:', err)
                    alert('Failed to reopen shift')
                  }
                }}
                className="px-4 py-2 bg-orange-500 text-white rounded font-semibold hover:bg-orange-600"
              >
                Reopen Shift
              </button>
            )}
            <button
              onClick={() => router.push('/shifts')}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded"
            >
              Back to List
            </button>
          </div>
        </div>
        
        {hasRedFlag && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-500 rounded">
            <p className="text-yellow-900 font-bold text-lg">
              ⚠️ Needs Review: Over/Short is not zero and has not been explained.
            </p>
          </div>
        )}
        
        {/* Header */}
        <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              {isEditable ? (
                <input
                  type="date"
                  value={editData.date}
                  onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              ) : (
                <div className="border border-gray-300 rounded px-3 py-2 bg-gray-50">{shift.date}</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
              {isEditable ? (
                <select
                  value={editData.shift}
                  onChange={(e) => setEditData({ ...editData, shift: e.target.value as ShiftType })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  <option value="6-1">6-1</option>
                  <option value="1-9">1-9</option>
                  <option value="7:30 - 2">7:30 - 2</option>
                </select>
              ) : (
                <div className="border border-gray-300 rounded px-3 py-2 bg-gray-50">{shift.shift}</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
              {isEditable ? (
              <select
                value={supervisorId}
                onChange={(e) => {
                  const selectedId = e.target.value
                  setSupervisorId(selectedId)
                  const selectedStaff = staffList.find(s => s.id === selectedId)
                  setEditData({ ...editData, supervisor: selectedStaff?.name || '' })
                }}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">Select supervisor</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} {staff.role !== 'cashier' ? `(${staff.role})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="border border-gray-300 rounded px-3 py-2 bg-gray-50">{shift.supervisor}</div>
            )}
          </div>
        </div>
        
        {/* Main Table */}
        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-blue-100 border border-gray-300 px-4 py-2 text-left">Description</th>
                <th className="bg-blue-600 text-white border border-gray-300 px-4 py-2 text-right">Count</th>
                <th className="bg-red-500 text-white border border-gray-300 px-4 py-2 text-right">System</th>
                <th className="bg-black text-white border border-gray-300 px-4 py-2 text-right">Over/Short</th>
                {(shift?.overShortItems?.length ?? 0) > 0 && (
                  <th className="bg-indigo-600 text-white border border-gray-300 px-4 py-2 text-right">Explained</th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 px-4 py-2">Cash</td>
                <td className={`border border-gray-300 px-4 py-2 text-right ${
                  !isDraft && changedFields.has('countCash') ? 'bg-blue-50' : ''
                }`}>
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.countCash) ? '' : editData.countCash}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, countCash: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    <div className="w-full text-right bg-transparent">
                      {shift.countCash.toFixed(2)}
                    </div>
                  )}
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-right ${
                  !isDraft && changedFields.has('systemCash') ? 'bg-blue-50' : ''
                }`}>
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.systemCash) ? '' : editData.systemCash}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, systemCash: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    <div className="w-full text-right bg-transparent">
                      {shift.systemCash.toFixed(2)}
                    </div>
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                  {isDraft ? (
                    ((Number.isNaN(editData.countCash) ? 0 : editData.countCash) - (Number.isNaN(editData.systemCash) ? 0 : editData.systemCash)).toFixed(2)
                  ) : (
                    (shift.overShortCash || 0).toFixed(2)
                  )}
                </td>
                {(shift?.overShortItems?.length ?? 0) > 0 && <td className="border border-gray-300 px-4 py-2 text-right text-gray-400">—</td>}
              </tr>
              <tr>
                <td className="border border-gray-300 px-4 py-2">Checks</td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.countChecks) ? '' : editData.countChecks}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, countChecks: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.countChecks.toFixed(2)
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.systemChecks) ? '' : editData.systemChecks}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, systemChecks: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.systemChecks.toFixed(2)
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                  {isEditable ? (
                    ((Number.isNaN(editData.countChecks) ? 0 : editData.countChecks) - (Number.isNaN(editData.systemChecks) ? 0 : editData.systemChecks)).toFixed(2)
                  ) : (
                    ((shift.overShortTotal || 0) - (shift.overShortCash || 0)).toFixed(2)
                  )}
                </td>
                {(shift?.overShortItems?.length ?? 0) > 0 && <td className="border border-gray-300 px-4 py-2 text-right text-gray-400">—</td>}
              </tr>
              <tr>
                <td className="border border-gray-300 px-4 py-2">Credits</td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.countCredit) ? '' : editData.countCredit}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, countCredit: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.countCredit.toFixed(2)
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.systemCredit) ? '' : editData.systemCredit}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, systemCredit: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.systemCredit.toFixed(2)
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                  {isEditable ? (
                    ((Number.isNaN(editData.countCredit) ? 0 : editData.countCredit) - (Number.isNaN(editData.systemCredit) ? 0 : editData.systemCredit)).toFixed(2)
                  ) : (
                    (shift.countCredit - shift.systemCredit).toFixed(2)
                  )}
                </td>
                {(shift?.overShortItems?.length ?? 0) > 0 && <td className="border border-gray-300 px-4 py-2 text-right text-gray-400">—</td>}
              </tr>
              <tr>
                <td className="border border-gray-300 px-4 py-2">In-House</td>
                <td className={`border border-gray-300 px-4 py-2 text-right ${
                  !isDraft && changedFields.has('countInhouse') ? 'bg-blue-50' : ''
                }`}>
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.countInhouse) ? '' : editData.countInhouse}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, countInhouse: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.countInhouse.toFixed(2)
                  )}
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-right ${
                  !isDraft && changedFields.has('systemInhouse') ? 'bg-blue-50' : ''
                }`}>
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.systemInhouse) ? '' : editData.systemInhouse}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, systemInhouse: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.systemInhouse.toFixed(2)
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                  {isEditable ? (
                    ((Number.isNaN(editData.countInhouse) ? 0 : editData.countInhouse) - (Number.isNaN(editData.systemInhouse) ? 0 : editData.systemInhouse)).toFixed(2)
                  ) : (
                    (shift.countInhouse - shift.systemInhouse).toFixed(2)
                  )}
                </td>
                {(shift?.overShortItems?.length ?? 0) > 0 && <td className="border border-gray-300 px-4 py-2 text-right text-gray-400">—</td>}
              </tr>
              <tr>
                <td className="border border-gray-300 px-4 py-2">Fleets</td>
                <td className={`border border-gray-300 px-4 py-2 text-right ${
                  !isDraft && changedFields.has('countFleet') ? 'bg-blue-50' : ''
                }`}>
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.countFleet) ? '' : editData.countFleet}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, countFleet: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.countFleet.toFixed(2)
                  )}
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-right ${
                  !isDraft && changedFields.has('systemFleet') ? 'bg-blue-50' : ''
                }`}>
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.systemFleet) ? '' : editData.systemFleet}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, systemFleet: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.systemFleet.toFixed(2)
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                  {isEditable ? (
                    ((Number.isNaN(editData.countFleet) ? 0 : editData.countFleet) - (Number.isNaN(editData.systemFleet) ? 0 : editData.systemFleet)).toFixed(2)
                  ) : (
                    (shift.countFleet - shift.systemFleet).toFixed(2)
                  )}
                </td>
                {(shift?.overShortItems?.length ?? 0) > 0 && <td className="border border-gray-300 px-4 py-2 text-right text-gray-400">—</td>}
              </tr>
              <tr>
                <td className="border border-gray-300 px-4 py-2">Massy Coupons</td>
                <td className={`border border-gray-300 px-4 py-2 text-right ${
                  !isDraft && changedFields.has('countMassyCoupons') ? 'bg-blue-50' : ''
                }`}>
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.countMassyCoupons) ? '' : editData.countMassyCoupons}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, countMassyCoupons: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.countMassyCoupons.toFixed(2)
                  )}
                </td>
                <td className={`border border-gray-300 px-4 py-2 text-right ${
                  !isDraft && changedFields.has('systemMassyCoupons') ? 'bg-blue-50' : ''
                }`}>
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(editData.systemMassyCoupons) ? '' : editData.systemMassyCoupons}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setEditData({ ...editData, systemMassyCoupons: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                      }}
                      className="w-full text-right border-0 focus:outline-none"
                    />
                  ) : (
                    shift.systemMassyCoupons.toFixed(2)
                  )}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                  {isEditable ? (
                    ((Number.isNaN(editData.countMassyCoupons) ? 0 : editData.countMassyCoupons) - (Number.isNaN(editData.systemMassyCoupons) ? 0 : editData.systemMassyCoupons)).toFixed(2)
                  ) : (
                    (shift.countMassyCoupons - shift.systemMassyCoupons).toFixed(2)
                  )}
                </td>
                {(shift?.overShortItems?.length ?? 0) > 0 && <td className="border border-gray-300 px-4 py-2 text-right text-gray-400">—</td>}
              </tr>
            </tbody>
          </table>
        </div>
        
        {/* Count (Cash+Check) Summary */}
        <div className="mt-4 overflow-x-auto mb-6">
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className="border border-gray-300 px-4 py-2 font-semibold">Count (Cash+Check)</td>
                <td className="bg-blue-600 text-white border border-gray-300 px-4 py-2 text-right font-semibold">
                  {isDraft ? (
                    ((Number.isNaN(editData.countCash) ? 0 : editData.countCash) + (Number.isNaN(editData.countChecks) ? 0 : editData.countChecks)).toFixed(2)
                  ) : (
                    (shift.countCash + shift.countChecks).toFixed(2)
                  )}
                </td>
                <td className="bg-red-500 text-white border border-gray-300 px-4 py-2 text-right font-semibold">
                  {isDraft ? (
                    ((Number.isNaN(editData.systemCash) ? 0 : editData.systemCash) + (Number.isNaN(editData.systemChecks) ? 0 : editData.systemChecks)).toFixed(2)
                  ) : (
                    (shift.systemCash + shift.systemChecks).toFixed(2)
                  )}
                </td>
                <td className="bg-black text-white border border-gray-300 px-4 py-2 text-right font-semibold">
                  {isDraft ? (
                    (((Number.isNaN(editData.countCash) ? 0 : editData.countCash) + (Number.isNaN(editData.countChecks) ? 0 : editData.countChecks)) - 
                     ((Number.isNaN(editData.systemCash) ? 0 : editData.systemCash) + (Number.isNaN(editData.systemChecks) ? 0 : editData.systemChecks))).toFixed(2)
                  ) : (
                    (shift.overShortTotal || 0).toFixed(2)
                  )}
                </td>
                {(shift?.overShortItems?.length ?? 0) > 0 && (
                  <td className="bg-indigo-100 border border-gray-300 px-4 py-2 text-right font-semibold">
                    {((shift?.overShortItems ?? []).reduce(
                      (sum, i) => sum + (i.type === 'overage' ? i.amount : -i.amount),
                      0
                    )).toFixed(2)}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
        
        {/* Two Column Layout */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Left: Deposits */}
          <div>
            <h3 className="bg-blue-100 px-4 py-2 font-semibold mb-2">Deposits</h3>
            {(isEditable ? editData.deposits : deposits).map((deposit: number, index: number) => {
              const isChangedDeposit = !isDraft && changedDepositIndices.has(index)
              return (
                <div
                  key={index}
                  className={`mb-2 ${isChangedDeposit ? 'bg-blue-50 rounded' : ''}`}
                >
                  <label className="bg-blue-200 px-4 py-2 min-w-[100px] inline-block">Deposit {index + 1}</label>
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isNaN(deposit) ? '' : deposit}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        const newDeposits = [...editData.deposits]
                        newDeposits[index] = v === '' || Number.isNaN(n) ? (Number.NaN as any) : n
                        setEditData({ ...editData, deposits: newDeposits })
                      }}
                      className="ml-2 border border-gray-300 rounded px-2 py-1 w-32 text-right bg-white"
                    />
                  ) : (
                    <span className="ml-2 px-2 py-1 inline-block">
                      {deposit.toFixed(2)}
                    </span>
                  )}
                </div>
              )
            })}
            {isEditable && editData.deposits.length < 6 && (
              <button
                onClick={() => setEditData({ ...editData, deposits: [...editData.deposits, 0] })}
                className="text-blue-600 text-sm mt-2"
              >
                + Add Deposit
              </button>
            )}
            <div className="mt-2">
              <label className="bg-blue-600 text-white px-4 py-2 font-semibold block">Total Deposit</label>
              <div className="border border-gray-300 px-4 py-2 text-right font-semibold">
                {isEditable ? (
                  editData.deposits.filter(d => !Number.isNaN(d)).reduce((sum, d) => sum + (Number.isNaN(d) ? 0 : d), 0).toFixed(2)
                ) : (
                  (shift.totalDeposits || 0).toFixed(2)
                )}
              </div>
            </div>
          </div>
          
          {/* Right: Other Items */}
          <div>
              <div className="mb-4">
              <label className="bg-purple-500 text-white px-4 py-2 font-semibold block mb-2">Credit</label>
              {isEditable ? (
                <input
                  type="number"
                  step="0.01"
                  value={Number.isNaN(editData.otherCredit) ? '' : editData.otherCredit}
                  onChange={(e) => {
                    const v = e.target.value
                    const n = parseFloat(v)
                    setEditData({ ...editData, otherCredit: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-right"
                />
              ) : (
                <div className="border border-gray-300 rounded px-3 py-2 bg-gray-50 text-right">{shift.otherCredit.toFixed(2)}</div>
              )}
            </div>
            <div className="mb-4">
              <label className="bg-blue-500 text-white px-4 py-2 font-semibold block mb-2">Debit</label>
              {isEditable ? (
                <input
                  type="number"
                  step="0.01"
                  value={Number.isNaN(editData.systemDebit) ? '' : editData.systemDebit}
                  onChange={(e) => {
                    const v = e.target.value
                    const n = parseFloat(v)
                    setEditData({ ...editData, systemDebit: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-right"
                />
              ) : (
                <div className="border border-gray-300 rounded px-3 py-2 bg-gray-50 text-right">{shift.systemDebit.toFixed(2)}</div>
              )}
            </div>
            <div className="mb-4">
              <label className="bg-green-300 px-4 py-2 font-semibold block mb-2">Unleaded</label>
              {isEditable ? (
                <input
                  type="number"
                  step="0.01"
                  value={Number.isNaN(editData.unleaded) ? '' : editData.unleaded}
                  onChange={(e) => {
                    const v = e.target.value
                    const n = parseFloat(v)
                    setEditData({ ...editData, unleaded: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-right"
                />
              ) : (
                <div className="border border-gray-300 rounded px-3 py-2 bg-gray-50 text-right">{shift.unleaded.toFixed(2)}</div>
              )}
            </div>
            <div className="mb-4">
              <label className="bg-green-600 text-white px-4 py-2 font-semibold block mb-2">Diesel</label>
              {isEditable ? (
                <input
                  type="number"
                  step="0.01"
                  value={Number.isNaN(editData.diesel) ? '' : editData.diesel}
                  onChange={(e) => {
                    const v = e.target.value
                    const n = parseFloat(v)
                    setEditData({ ...editData, diesel: v === '' || Number.isNaN(n) ? (Number.NaN as any) : n })
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-right"
                />
              ) : (
                <div className="border border-gray-300 rounded px-3 py-2 bg-gray-50 text-right">{shift.diesel.toFixed(2)}</div>
              )}
            </div>
          </div>
        </div>
        
        {/* Notes */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="bg-blue-100 px-4 py-2 font-semibold block">Notes</label>
            {!isDraft && !isEditingNotes && shift.noteHistory && shift.noteHistory.length > 0 && (
              <button
                onClick={() => setShowNoteHistory(!showNoteHistory)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {showNoteHistory ? 'Hide' : 'View'} Note History ({shift.noteHistory.length})
              </button>
            )}
          </div>
          {isDraft ? (
            <textarea
              value={editData.notes}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 min-h-[100px]"
              placeholder="Enter notes..."
            />
          ) : isEditingNotes ? (
            <>
              <textarea
                value={editedNotes}
                onChange={(e) => {
                  // Only update local state - NO API calls
                  setEditedNotes(e.target.value)
                }}
                onKeyDown={(e) => {
                  // Prevent Enter from submitting (if inside a form)
                  if (e.key === 'Enter' && e.ctrlKey) {
                    // Allow Ctrl+Enter to save (optional feature)
                    return
                  }
                }}
                className={`w-full border border-gray-300 rounded px-3 py-2 min-h-[100px] whitespace-pre-wrap ${
                  changedFields.has('notes') ? 'bg-blue-50' : ''
                }`}
                placeholder="Enter notes..."
                disabled={savingNotes}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={async () => {
                    const trimmedEdited = editedNotes.trim()
                    const trimmedCurrent = (shift.notes || '').trim()
                    
                    if (trimmedEdited === trimmedCurrent) {
                      // No change, just cancel
                      setIsEditingNotes(false)
                      return
                    }
                    
                    setSavingNotes(true)
                    try {
                      const res = await fetch(`/api/shifts/${shift.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes: editedNotes })
                      })
                      if (res.ok) {
                        const updated = await res.json()
                        setShift(updated)
                        setIsEditingNotes(false)
                        // Update changed fields if notes were changed
                        if (updated.corrections) {
                          const changed = new Set<string>(updated.corrections.map((c: any) => c.field as string))
                          setChangedFields(changed)
                        }
                        // Refresh note history if it exists
                        if (updated.noteHistory) {
                          // History will be updated in the shift object
                        }
                      } else {
                        alert('Failed to save notes. Please try again.')
                      }
                    } catch (err) {
                      console.error('Error updating notes:', err)
                      alert('Failed to save notes. Please try again.')
                    } finally {
                      setSavingNotes(false)
                    }
                  }}
                  disabled={savingNotes}
                  className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {savingNotes ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditedNotes(shift.notes || '')
                    setIsEditingNotes(false)
                  }}
                  disabled={savingNotes}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded font-semibold hover:bg-gray-400 disabled:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={`border border-gray-300 rounded px-3 py-2 min-h-[100px] bg-gray-50 whitespace-pre-wrap ${
                changedFields.has('notes') ? 'bg-blue-50' : ''
              }`}>
                {shift.notes || '(No notes)'}
              </div>
              <button
                onClick={() => {
                  setEditedNotes(shift.notes || '')
                  setIsEditingNotes(true)
                }}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 text-sm"
              >
                Edit Notes
              </button>
              {showNoteHistory && shift.noteHistory && shift.noteHistory.length > 0 && (
                <div className="mt-4 border border-gray-300 rounded p-4 bg-gray-50">
                  <h4 className="font-semibold text-gray-900 mb-3">Note History</h4>
                  <div className="space-y-3">
                    {shift.noteHistory.map((history: any, idx: number) => (
                      <div key={history.id} className="border-b border-gray-200 pb-3 last:border-b-0">
                        <div className="text-sm text-gray-600 mb-1">
                          <strong>Previous:</strong> {history.oldNote || '(No notes)'}
                        </div>
                        <div className="text-sm text-gray-900 mb-1">
                          <strong>Changed to:</strong> {history.newNote || '(No notes)'}
                        </div>
                        <div className="text-xs text-gray-500">
                          Changed by {history.changedBy} on {new Date(history.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Document Scans - Link to Day Report */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">📄 Document Scans</h3>
              <p className="text-sm text-gray-600">
                View and manage deposit and debit scans for this day on the Day Report page.
              </p>
            </div>
            <button
              onClick={() => router.push('/days')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 whitespace-nowrap ml-4"
            >
              View Day Report
            </button>
          </div>
        </div>
        
        {/* Missing Data & Over/Short Explanation - Editable */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={hasMissingHardCopyData}
                onChange={(e) => {
                  setHasMissingHardCopyData(e.target.checked)
                  updateCheckbox('hasMissingHardCopyData', e.target.checked)
                }}
                className="w-4 h-4"
              />
              <span className="font-semibold text-gray-700">Missing hard copy data</span>
            </label>
            {hasMissingHardCopyData && (
              <textarea
                value={missingDataNotes}
                onChange={(e) => {
                  setMissingDataNotes(e.target.value)
                  updateCheckbox('missingDataNotes', e.target.value)
                }}
                className="w-full border border-gray-300 rounded px-3 py-2 min-h-[80px] mt-2"
                placeholder="Describe what data is missing..."
              />
            )}
          </div>
          
          <div className="flex flex-col gap-2 text-sm">
            <button
              type="button"
              onClick={() => setShowOverShortModal(true)}
              disabled={shift?.status === 'draft'}
              className="inline-flex items-center px-3 py-1.5 rounded border font-medium
                         border-blue-500 text-blue-600 hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {shift?.overShortExplained ? 'Edit Over/Short Explanation' : 'Explain Over/Short Discrepancy'}
            </button>
            {shift?.overShortExplained && shift.overShortExplanation && (
              <p className="text-xs text-gray-600 border border-blue-100 bg-blue-50 rounded px-2 py-1">
                <span className="font-semibold">Current explanation:</span> {shift.overShortExplanation}
              </p>
            )}
            <p className="text-xs text-gray-500">
              When a non-zero Over/Short is explained and all conditions are met, this shift will be marked as <span className="font-semibold">Reviewed</span>.
            </p>
          </div>

          {/* Over/Short Items - structured overages and shortages */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-800 mb-2">Over/Short Items</h4>
            <p className="text-xs text-gray-600 mb-3">
              Raw Over/Short: <span className="font-semibold">{(shift?.overShortTotal ?? 0).toFixed(2)}</span>
              {' '}(from count vs system)
            </p>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setAddOverShortType('overage')
                  setAddOverShortAmount('')
                  setAddOverShortDescription('')
                  setShowAddOverShortModal(true)
                }}
                className="px-3 py-1.5 rounded font-medium bg-green-600 text-white hover:bg-green-700 text-sm"
              >
                + Add overage
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddOverShortType('shortage')
                  setAddOverShortAmount('')
                  setAddOverShortDescription('')
                  setShowAddOverShortModal(true)
                }}
                className="px-3 py-1.5 rounded font-medium bg-red-600 text-white hover:bg-red-700 text-sm"
              >
                − Add shortage
              </button>
            </div>
            {(shift?.overShortItems?.length ?? 0) > 0 ? (
              <div className="space-y-1.5">
                {shift.overShortItems!.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                      item.type === 'overage' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={item.type === 'overage' ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                        {item.type === 'overage' ? '+' : '−'}${item.amount.toFixed(2)}
                      </span>
                      <span className="text-gray-700">{item.description}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('Delete this item?')) return
                        try {
                          const res = await fetch(`/api/shifts/${shift!.id}/over-short-items/${item.id}`, { method: 'DELETE' })
                          if (res.ok) {
                            const updated = await fetch(`/api/shifts/${shift!.id}`).then(r => r.json())
                            setShift(updated)
                          }
                        } catch (err) {
                          console.error('Failed to delete:', err)
                        }
                      }}
                      className="text-gray-400 hover:text-red-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {(() => {
                  const explainedTotal = (shift?.overShortItems ?? []).reduce(
                    (sum, i) => sum + (i.type === 'overage' ? i.amount : -i.amount),
                    0
                  )
                  const raw = shift?.overShortTotal ?? 0
                  return (
                    <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                      Explained total: {explainedTotal.toFixed(2)}
                      {Math.abs(raw - explainedTotal) > 0.01 && (
                        <span className="text-amber-600 ml-1">(diff from raw: {(raw - explainedTotal).toFixed(2)})</span>
                      )}
                    </p>
                  )
                })()}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">No items yet. Add overages (e.g. Rumie check) or shortages (e.g. Manager took from drawer).</p>
            )}
          </div>
          
          {/* Auto-detected missing fields warning */}
          {shift && (() => {
            const missing = getMissingFields({
              systemCash: shift.systemCash,
              systemChecks: shift.systemChecks,
              systemCredit: shift.systemCredit,
              systemDebit: shift.systemDebit,
              otherCredit: shift.otherCredit,
              systemInhouse: shift.systemInhouse,
              systemFleet: shift.systemFleet,
              systemMassyCoupons: shift.systemMassyCoupons,
              countCash: shift.countCash,
              countChecks: shift.countChecks,
              countCredit: shift.countCredit,
              countInhouse: shift.countInhouse,
              countFleet: shift.countFleet,
              countMassyCoupons: shift.countMassyCoupons,
              unleaded: shift.unleaded,
              diesel: shift.diesel,
              deposits: shift.deposits
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
        
        {/* Change Log */}
        {shift.corrections && shift.corrections.length > 0 && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-gray-900">Change Log</h3>
              <button
                onClick={() => setShowChangeLog(!showChangeLog)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {showChangeLog ? 'Hide' : 'Show'} Change Log ({shift.corrections.length})
              </button>
            </div>
            {showChangeLog && (
              <div className="border-2 border-gray-300 rounded bg-gray-50">
                <div className="max-h-64 overflow-y-auto">
                  {shift.corrections.map((correction: any) => (
                    <div key={correction.id} className="p-3 border-b border-gray-200 last:border-b-0">
                      <p className="text-sm text-gray-900 font-medium">
                        <strong>{correction.field}:</strong> <span className="text-red-600">{correction.oldValue}</span> → <span className="text-green-600">{correction.newValue}</span>
                      </p>
                      {correction.reason && (
                        <p className="text-xs text-gray-600 mt-1">Reason: {correction.reason}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Changed by {correction.changedBy || 'admin'} on {new Date(correction.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        <p className="text-xs text-gray-400 mt-4">
          Created: {new Date(shift.createdAt).toLocaleString()}
        </p>
      </div>

      {/* Over/Short Explanation Modal */}
      {showOverShortModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">
                Explain Over/Short Discrepancy
              </h3>
              <button
                type="button"
                onClick={() => setShowOverShortModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-700">
                Over/Short total:{' '}
                <span className="font-semibold">
                  {(shift.overShortTotal || 0).toFixed(2)}
                </span>
              </p>
              <textarea
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                rows={4}
                value={overShortExplanationDraft}
                onChange={(e) => setOverShortExplanationDraft(e.target.value)}
                placeholder="Describe why this over/short is acceptable..."
              />
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOverShortModal(false)}
                className="px-4 py-1.5 rounded border text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOverShortExplanation}
                className="px-4 py-1.5 rounded bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
              >
                Confirm &amp; Mark Explained
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Over/Short Item Modal */}
      {showAddOverShortModal && shift && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">
                Add {addOverShortType === 'overage' ? 'Overage' : 'Shortage'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddOverShortModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={addOverShortAmount}
                  onChange={(e) => setAddOverShortAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={addOverShortDescription}
                  onChange={(e) => setAddOverShortDescription(e.target.value)}
                  placeholder={addOverShortType === 'overage' ? 'e.g. Rumie Tours check' : 'e.g. Manager requested from drawer'}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddOverShortModal(false)}
                className="px-4 py-1.5 rounded border text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingOverShortItem || !addOverShortAmount || Number(addOverShortAmount) <= 0 || !addOverShortDescription.trim()}
                onClick={async () => {
                  const amt = Number(addOverShortAmount)
                  if (amt <= 0 || !addOverShortDescription.trim()) return
                  setSavingOverShortItem(true)
                  try {
                    const res = await fetch(`/api/shifts/${shift.id}/over-short-items`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: addOverShortType,
                        amount: amt,
                        description: addOverShortDescription.trim()
                      })
                    })
                    if (!res.ok) throw new Error('Failed to add')
                    const updated = await fetch(`/api/shifts/${shift.id}`).then(r => r.json())
                    setShift(updated)
                    setShowAddOverShortModal(false)
                    setAddOverShortAmount('')
                    setAddOverShortDescription('')
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Failed to add item')
                  } finally {
                    setSavingOverShortItem(false)
                  }
                }}
                className={`px-4 py-1.5 rounded text-sm font-semibold ${
                  addOverShortType === 'overage'
                    ? 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-60'
                    : 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-60'
                }`}
              >
                {savingOverShortItem ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
