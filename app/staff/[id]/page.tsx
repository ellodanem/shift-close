'use client'

import { Suspense, useEffect, useMemo, useState, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import StaffDocumentUpload from './StaffDocumentUpload'
import DocumentGenerationModal from '../DocumentGenerationModal'
import BankSelect from '../BankSelect'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { useAuth } from '@/app/components/AuthContext'

interface Staff {
  id: string
  name: string
  firstName?: string
  lastName?: string
  dateOfBirth: string | null
  startDate: string | null
  status: string
  role: string
  roleId: string | null
  notes: string
  vacationStart?: string | null
  vacationEnd?: string | null
  mobileNumber?: string | null
  _count?: {
    shifts: number
  }
}

interface StaffRole {
  id: string
  name: string
  badgeColor?: string | null
  sortOrder: number
}

interface StaffDocument {
  id: string
  type: string
  fileName: string
  fileUrl: string
  uploadedAt: string
}

interface PreviewDocument {
  fileName: string
  fileUrl: string
}

interface StaffDayOff {
  id: string
  date: string
  reason?: string | null
  status: string
}

interface StaffSickLeave {
  id: string
  startDate: string
  endDate: string
  reason?: string | null
  status: string
  documents?: { id: string; fileName: string; fileUrl: string }[]
}

interface StaffCallOut {
  id: string
  date: string
  calledAt: string
  notes: string
  recordedByLabel?: string | null
}

type StaffTab = 'profile' | 'time-off' | 'documents' | 'attendance' | 'payroll'

const STAFF_TABS: { id: StaffTab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'time-off', label: 'Time off' },
  { id: 'documents', label: 'Documents' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'payroll', label: 'Payroll' }
]

function parseStaffTab(value: string | null): StaffTab {
  if (value === 'time-off' || value === 'documents' || value === 'attendance' || value === 'payroll') {
    return value
  }
  return 'profile'
}

function FieldDisplay({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 break-words">{value || '—'}</dd>
    </div>
  )
}

function initialsFor(firstName: string, lastName: string, fallback: string) {
  const a = firstName.trim().charAt(0)
  const b = lastName.trim().charAt(0)
  const initials = `${a}${b}`.toUpperCase()
  if (initials.trim()) return initials
  return fallback.trim().charAt(0).toUpperCase() || '?'
}

function documentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    'sick-leave': 'Sick Leave',
    contract: 'Contract',
    id: 'ID/Passport',
    other: 'Other'
  }
  return labels[type] || type
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function EditStaffPageInner() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const { canViewStaffSensitive } = useAuth()

  const activeTab = parseStaffTab(searchParams.get('tab'))
  const setActiveTab = (tab: StaffTab) => {
    const next = new URLSearchParams(searchParams.toString())
    if (tab === 'profile') next.delete('tab')
    else next.set('tab', tab)
    const qs = next.toString()
    router.replace(`/staff/${id}${qs ? `?${qs}` : ''}`, { scroll: false })
    setEditing(false)
    setError(null)
    setDocumentMenuId(null)
    setShowUploadPanel(false)
  }

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    startDate: '',
    status: 'active',
    roleId: '',
    nicNumber: '',
    deviceUserId: '',
    address: '',
    bankName: '',
    accountNumber: '',
    mobileNumber: '',
    notes: '',
    vacationStart: '' as string,
    vacationEnd: '' as string,
    punchExempt: false
  })
  const displayName = [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim() || 'Staff'
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shiftCount, setShiftCount] = useState(0)
  const [documents, setDocuments] = useState<StaffDocument[]>([])
  const [dayOffs, setDayOffs] = useState<StaffDayOff[]>([])
  const [dayOffDate, setDayOffDate] = useState('')
  const [dayOffReason, setDayOffReason] = useState('')
  const [savingDayOff, setSavingDayOff] = useState(false)
  const [callOuts, setCallOuts] = useState<StaffCallOut[]>([])
  const [sickLeaves, setSickLeaves] = useState<StaffSickLeave[]>([])
  const [sickLeaveStartDate, setSickLeaveStartDate] = useState('')
  const [sickLeaveEndDate, setSickLeaveEndDate] = useState('')
  const [sickLeaveReason, setSickLeaveReason] = useState('')
  const [sickLeaveDocFile, setSickLeaveDocFile] = useState<File | null>(null)
  const sickLeaveDocInputRef = useRef<HTMLInputElement>(null)
  const [savingSickLeave, setSavingSickLeave] = useState(false)
  const [uploadingSickLeaveDocId, setUploadingSickLeaveDocId] = useState<string | null>(null)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showTemplateSelection, setShowTemplateSelection] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [showVacationModal, setShowVacationModal] = useState(false)
  const [vacationStart, setVacationStart] = useState('')
  const [vacationEnd, setVacationEnd] = useState('')
  const [savingVacation, setSavingVacation] = useState(false)
  const [previewDocument, setPreviewDocument] = useState<PreviewDocument | null>(null)
  const [formSnapshot, setFormSnapshot] = useState<typeof formData | null>(null)
  const [documentMenuId, setDocumentMenuId] = useState<string | null>(null)
  const [showUploadPanel, setShowUploadPanel] = useState(false)

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === formData.roleId) ?? null,
    [roles, formData.roleId]
  )

  const visibleTabs = useMemo(
    () => STAFF_TABS.filter((tab) => tab.id !== 'payroll' || canViewStaffSensitive),
    [canViewStaffSensitive]
  )

  useEffect(() => {
    if (activeTab === 'payroll' && !canViewStaffSensitive) {
      const next = new URLSearchParams(searchParams.toString())
      next.delete('tab')
      const qs = next.toString()
      router.replace(`/staff/${id}${qs ? `?${qs}` : ''}`, { scroll: false })
    }
  }, [activeTab, canViewStaffSensitive, id, router, searchParams])

  useEffect(() => {
    if (!documentMenuId) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-doc-menu]')) return
      setDocumentMenuId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [documentMenuId])

  useEffect(() => {
    fetch('/api/staff-roles')
      .then((res) => res.json())
      .then((data: StaffRole[]) => {
        setRoles(data)
        setLoadingRoles(false)
        fetchStaff()
      })
      .catch((err) => {
        console.error('Error fetching roles:', err)
        setLoadingRoles(false)
        fetchStaff()
      })

    fetchDocuments()
    fetchDayOffs()
    fetchCallOuts()
    fetchSickLeaves()

    const params = new URLSearchParams(window.location.search)
    const generate = params.get('generate')
    if (generate) {
      setShowTemplateSelection(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [id])

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/staff/${id}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    }
  }

  const fetchDayOffs = async () => {
    try {
      const res = await fetch(`/api/staff/${id}/day-off`)
      if (res.ok) {
        const data: StaffDayOff[] = await res.json()
        setDayOffs(data)
      }
    } catch (error) {
      console.error('Error fetching day off records:', error)
    }
  }

  const fetchCallOuts = async () => {
    try {
      const res = await fetch(`/api/staff/${id}/call-out`)
      if (res.ok) {
        const data: StaffCallOut[] = await res.json()
        setCallOuts(data)
      }
    } catch (error) {
      console.error('Error fetching call outs:', error)
    }
  }

  const sickLeaveCoversDate = (date: string) =>
    sickLeaves.some((sl) => sl.status !== 'denied' && sl.startDate <= date && sl.endDate >= date)

  const fetchSickLeaves = async () => {
    try {
      const res = await fetch(`/api/staff/${id}/sick-leave`)
      if (res.ok) {
        const data: StaffSickLeave[] = await res.json()
        setSickLeaves(data)
      }
    } catch (error) {
      console.error('Error fetching sick leave records:', error)
    }
  }

  const uploadSickLeaveDocument = async (sickLeaveId: string, file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      throw new Error('Invalid file type. Must be JPEG, PNG, or PDF')
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size must be less than 10MB')
    }

    const docForm = new FormData()
    docForm.append('file', file)
    const res = await fetch(`/api/staff/${id}/sick-leave/${sickLeaveId}/documents`, {
      method: 'POST',
      body: docForm
    })
    if (!res.ok) {
      let message = 'Failed to upload sick leave document'
      try {
        const data = await res.json()
        if (data?.error) message = data.error
      } catch {
        // Keep fallback message
      }
      throw new Error(message)
    }
  }

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) {
      return
    }

    try {
      const res = await fetch(`/api/staff/${id}/documents?documentId=${documentId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        fetchDocuments()
      } else {
        alert('Failed to delete document')
      }
    } catch (error) {
      console.error('Error deleting document:', error)
      alert('Failed to delete document')
    }
  }

  const handleGenerateDocument = async (templateType: string) => {
    try {
      const res = await fetch(`/api/staff/${id}/generate-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateType })
      })

      if (!res.ok) {
        throw new Error('Failed to generate document')
      }

      const data = await res.json()
      setGeneratedContent(data.content)
      setSelectedTemplate(templateType)
      setShowGenerateModal(true)
    } catch (error) {
      console.error('Error generating document:', error)
      alert('Failed to generate document')
    }
  }

  const handlePrintDocument = () => {
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1)} - ${displayName}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
              pre { white-space: pre-wrap; font-family: Arial, sans-serif; }
            </style>
          </head>
          <body>
            <pre>${generatedContent}</pre>
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()
    }
  }

  const fetchStaff = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/staff/${id}`)
      if (!res.ok) {
        throw new Error('Failed to fetch staff')
      }
      const data: Staff = await res.json()
      const first = data.firstName ?? (data.name ? data.name.split(' ')[0] ?? '' : '')
      const last = data.lastName ?? (data.name ? data.name.split(' ').slice(1).join(' ') ?? '' : '')
      const next = {
        firstName: first,
        lastName: last,
        dateOfBirth: data.dateOfBirth || '',
        startDate: data.startDate || '',
        status: data.status,
        roleId: data.roleId || '',
        nicNumber: (data as any).nicNumber || '',
        deviceUserId: (data as any).deviceUserId || '',
        address: (data as any).address || '',
        bankName: (data as any).bankName || '',
        accountNumber: (data as any).accountNumber || '',
        mobileNumber: (data as any).mobileNumber || '',
        notes: data.notes,
        vacationStart: (data as any).vacationStart || '',
        vacationEnd: (data as any).vacationEnd || '',
        punchExempt: (data as any).punchExempt === true
      }
      setFormData(next)
      setShiftCount(data._count?.shifts || 0)
    } catch (error) {
      console.error('Error fetching staff:', error)
      setError('Failed to load staff member')
    } finally {
      setLoading(false)
    }
  }

  const startEditing = () => {
    setFormSnapshot({ ...formData })
    setEditing(true)
    setError(null)
  }

  const cancelEditing = () => {
    if (formSnapshot) setFormData(formSnapshot)
    setFormSnapshot(null)
    setEditing(false)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          dateOfBirth: formData.dateOfBirth || null,
          startDate: formData.startDate || null,
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim()
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to update staff')
      }

      setFormSnapshot(null)
      setEditing(false)
      await fetchStaff()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update staff')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteStaff = async () => {
    if (!confirm(`Are you sure you want to delete ${displayName}?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/staff/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete staff')
      }
      router.push('/staff')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete staff')
    } finally {
      setDeleting(false)
    }
  }

  const openVacationModal = () => {
    setVacationStart(formData.vacationStart || '')
    setVacationEnd(formData.vacationEnd || '')
    setShowVacationModal(true)
  }

  const saveVacation = async () => {
    if (!vacationStart.trim() || !vacationEnd.trim()) {
      alert('Please enter both start and end date.')
      return
    }
    if (vacationStart > vacationEnd) {
      alert('End date must be on or after start date.')
      return
    }
    setSavingVacation(true)
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacationStart: vacationStart.trim(), vacationEnd: vacationEnd.trim() })
      })
      if (!res.ok) throw new Error('Failed to save vacation')
      setFormData((prev) => ({ ...prev, vacationStart: vacationStart.trim(), vacationEnd: vacationEnd.trim() }))
      setShowVacationModal(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save vacation')
    } finally {
      setSavingVacation(false)
    }
  }

  const clearVacation = async () => {
    setSavingVacation(true)
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacationStart: null, vacationEnd: null })
      })
      if (!res.ok) throw new Error('Failed to clear vacation')
      setFormData((prev) => ({ ...prev, vacationStart: '', vacationEnd: '' }))
      setShowVacationModal(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear vacation')
    } finally {
      setSavingVacation(false)
    }
  }

  const isPdfFile = (url: string, fileName: string) =>
    url.toLowerCase().includes('.pdf') || fileName.toLowerCase().endsWith('.pdf')

  const inputClass =
    'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  const statusActive = formData.status === 'active'
  const onVacation =
    !!formData.vacationStart &&
    !!formData.vacationEnd &&
    formData.vacationStart <= businessTodayYmd() &&
    formData.vacationEnd >= businessTodayYmd()

  const editFooter = (
    <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-4">
      <button
        type="button"
        onClick={cancelEditing}
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
      >
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-4 sm:pt-6">
          <nav className="mb-3 text-sm text-gray-500" aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/staff" className="text-blue-600 hover:text-blue-800">
                  Staff
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li className="text-gray-700 font-medium truncate max-w-[min(100%,20rem)]">{displayName}</li>
            </ol>
          </nav>

          {/* Identity header */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4 sm:px-6 mb-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4 min-w-0">
                <div
                  className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base font-semibold text-slate-700"
                  aria-hidden
                >
                  {initialsFor(formData.firstName, formData.lastName, displayName)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{displayName}</h1>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        statusActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {statusActive ? 'Active' : 'Inactive'}
                    </span>
                    {onVacation && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                        On vacation
                      </span>
                    )}
                    {formData.punchExempt && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
                        Punch exempt
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                    {selectedRole && (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: selectedRole.badgeColor || '#64748b' }}
                      >
                        {selectedRole.name}
                      </span>
                    )}
                    {formData.startDate && <span>Started {formData.startDate}</span>}
                    {formData.deviceUserId && (
                      <span className="font-mono tabular-nums">Device #{formData.deviceUserId}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {(activeTab === 'profile' || activeTab === 'attendance' || activeTab === 'payroll') &&
                  !editing && (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => router.push('/staff')}
                  className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50"
                >
                  Back to list
                </button>
                <button
                  type="button"
                  onClick={handleDeleteStaff}
                  disabled={deleting}
                  className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded font-medium hover:bg-red-50 disabled:opacity-60"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>

          {/* Section tabs */}
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Staff profile sections">
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'documents' && documents.length > 0 ? ` (${documents.length})` : ''}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 sm:py-6">
        {shiftCount > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            This staff member is referenced by {shiftCount} shift(s). Changes will affect future shifts only.
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-800">{error}</div>
        )}

        {/* Profile */}
        {activeTab === 'profile' && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Personal & role</h2>
            </div>

            {editing ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  {canViewStaffSensitive && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">NIC number</label>
                      <input
                        type="text"
                        value={formData.nicNumber}
                        onChange={(e) => setFormData({ ...formData, nicNumber: e.target.value })}
                        className={inputClass}
                        placeholder="National ID / NIC"
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className={inputClass}
                      placeholder="Home address"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mobile (WhatsApp)</label>
                    <input
                      type="tel"
                      value={formData.mobileNumber}
                      onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. +1 242 555 1234"
                    />
                    <p className="text-xs text-gray-500 mt-0.5">Used for roster WhatsApp links. Include country code.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role <span className="text-red-500">*</span>
                    </label>
                    {loadingRoles ? (
                      <div className={`${inputClass} bg-gray-50 text-gray-500`}>Loading roles...</div>
                    ) : (
                      <select
                        required
                        value={formData.roleId}
                        onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                        className={inputClass}
                      >
                        {roles.length === 0 && <option value="">No roles available</option>}
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className={inputClass}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className={inputClass}
                      placeholder="Additional notes about this staff member"
                    />
                  </div>
                </div>
                {editFooter}
              </>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                <FieldDisplay label="First name" value={formData.firstName} />
                <FieldDisplay label="Last name" value={formData.lastName} />
                <FieldDisplay label="Date of birth" value={formData.dateOfBirth} />
                {canViewStaffSensitive && (
                  <FieldDisplay label="NIC number" value={formData.nicNumber || null} />
                )}
                <FieldDisplay label="Address" value={formData.address} />
                <FieldDisplay label="Mobile (WhatsApp)" value={formData.mobileNumber} />
                <FieldDisplay label="Role" value={selectedRole?.name} />
                <FieldDisplay
                  label="Status"
                  value={statusActive ? 'Active' : 'Inactive'}
                />
                <FieldDisplay label="Start date" value={formData.startDate} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <FieldDisplay label="Notes" value={formData.notes || null} />
                </div>
              </dl>
            )}
          </form>
        )}

        {/* Time off */}
        {activeTab === 'time-off' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Vacation</h2>
              {formData.vacationStart && formData.vacationEnd ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-700">
                    {formData.vacationStart} – {formData.vacationEnd}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800">
                    Not schedulable in roster during this period
                  </span>
                </div>
              ) : (
                <span className="text-sm text-gray-500">No vacation set</span>
              )}
              <button
                type="button"
                onClick={openVacationModal}
                className="mt-3 px-3 py-1.5 text-sm border border-amber-600 text-amber-700 rounded font-medium hover:bg-amber-50"
              >
                {formData.vacationStart && formData.vacationEnd ? 'Change vacation' : 'Set vacation'}
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Call outs</h2>
                <Link
                  href="/time-off?tab=call-outs"
                  className="text-sm font-medium text-teal-700 hover:text-teal-900"
                >
                  Log on Time Off page →
                </Link>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Phone log only — does not change hours. Sick leave on the same day is shown separately.
              </p>
              {callOuts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No call outs recorded.</p>
              ) : (
                <div className="space-y-2">
                  {[...callOuts].map((c) => {
                    const overlap = sickLeaveCoversDate(c.date)
                    return (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded border border-teal-100 bg-teal-50/50"
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-gray-900">{c.date}</span>
                          <span className="text-sm text-gray-500 ml-2">
                            {new Date(c.calledAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </span>
                          {c.notes ? (
                            <span className="text-sm text-gray-600 block truncate">{c.notes}</span>
                          ) : null}
                          {c.recordedByLabel ? (
                            <span className="text-xs text-gray-400 block">Logged by {c.recordedByLabel}</span>
                          ) : null}
                        </div>
                        {overlap ? (
                          <span className="text-[10px] font-semibold uppercase text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded shrink-0">
                            + sick leave
                          </span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Day off requests</h2>
              <div className="flex flex-wrap gap-3 items-end mb-5">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={dayOffDate}
                    onChange={(e) => setDayOffDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={dayOffReason}
                    onChange={(e) => setDayOffReason(e.target.value)}
                    placeholder="e.g. Medical appointment"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={!dayOffDate || savingDayOff}
                  onClick={async () => {
                    setSavingDayOff(true)
                    try {
                      const res = await fetch(`/api/staff/${id}/day-off`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date: dayOffDate, reason: dayOffReason })
                      })
                      if (res.ok) {
                        setDayOffDate('')
                        setDayOffReason('')
                        fetchDayOffs()
                      } else {
                        alert('Failed to save day off request')
                      }
                    } catch {
                      alert('Failed to save day off request')
                    } finally {
                      setSavingDayOff(false)
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {savingDayOff ? 'Saving…' : '+ Add'}
                </button>
              </div>

              {dayOffs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No day off requests recorded.</p>
              ) : (
                <div className="space-y-2">
                  {[...dayOffs]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((d) => {
                      const isPast = d.date < businessTodayYmd()
                      const statusColors: Record<string, string> = {
                        approved: 'bg-green-100 text-green-800',
                        denied: 'bg-red-100 text-red-800',
                        requested: 'bg-yellow-100 text-yellow-800'
                      }
                      return (
                        <div
                          key={d.id}
                          className={`flex items-center justify-between px-3 py-2 rounded border ${
                            isPast ? 'border-gray-200 bg-gray-50' : 'border-blue-100 bg-blue-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                              {d.date}
                            </span>
                            {d.reason && <span className="text-sm text-gray-500 truncate">{d.reason}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                                statusColors[d.status] ?? 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {d.status}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm('Remove this day off request?')) return
                                try {
                                  await fetch(`/api/staff/day-off/${d.id}`, { method: 'DELETE' })
                                  fetchDayOffs()
                                } catch {
                                  alert('Failed to delete')
                                }
                              }}
                              className="text-gray-400 hover:text-red-600 text-sm leading-none"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Sick leave</h2>
              <div className="flex flex-wrap gap-3 items-end mb-5">
                <div className="min-w-[120px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                  <input
                    type="date"
                    value={sickLeaveStartDate}
                    onChange={(e) => setSickLeaveStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                  <input
                    type="date"
                    value={sickLeaveEndDate}
                    onChange={(e) => setSickLeaveEndDate(e.target.value)}
                    min={sickLeaveStartDate}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={sickLeaveReason}
                    onChange={(e) => setSickLeaveReason(e.target.value)}
                    placeholder="e.g. Flu"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div className="min-w-[180px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Doctor&apos;s note <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    ref={sickLeaveDocInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={(e) => setSickLeaveDocFile(e.target.files?.[0] ?? null)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-rose-50 file:text-rose-700"
                  />
                </div>
                <button
                  type="button"
                  disabled={
                    !sickLeaveStartDate ||
                    savingSickLeave ||
                    !!(sickLeaveEndDate && sickLeaveEndDate < sickLeaveStartDate)
                  }
                  onClick={async () => {
                    setSavingSickLeave(true)
                    try {
                      const end = sickLeaveEndDate || sickLeaveStartDate
                      const res = await fetch(`/api/staff/${id}/sick-leave`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          startDate: sickLeaveStartDate,
                          endDate: end,
                          reason: sickLeaveReason
                        })
                      })
                      if (!res.ok) {
                        alert('Failed to save sick leave')
                        return
                      }
                      const created = await res.json()
                      if (sickLeaveDocFile) {
                        await uploadSickLeaveDocument(created.id, sickLeaveDocFile)
                      }
                      setSickLeaveStartDate('')
                      setSickLeaveEndDate('')
                      setSickLeaveReason('')
                      setSickLeaveDocFile(null)
                      if (sickLeaveDocInputRef.current) sickLeaveDocInputRef.current.value = ''
                      fetchSickLeaves()
                      fetchDocuments()
                    } catch {
                      alert('Failed to save sick leave')
                    } finally {
                      setSavingSickLeave(false)
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 text-white rounded text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {savingSickLeave ? 'Saving…' : '+ Add'}
                </button>
              </div>

              {sickLeaves.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No sick leave recorded.</p>
              ) : (
                <div className="space-y-2">
                  {[...sickLeaves]
                    .sort((a, b) => b.startDate.localeCompare(a.startDate))
                    .map((s) => {
                      const isPast = s.endDate < businessTodayYmd()
                      const statusColors: Record<string, string> = {
                        approved: 'bg-green-100 text-green-800',
                        denied: 'bg-red-100 text-red-800',
                        requested: 'bg-yellow-100 text-yellow-800'
                      }
                      const rangeLabel =
                        s.startDate === s.endDate ? s.startDate : `${s.startDate} – ${s.endDate}`
                      return (
                        <div
                          key={s.id}
                          className={`flex items-center justify-between px-3 py-2 rounded border ${
                            isPast ? 'border-gray-200 bg-gray-50' : 'border-rose-200 bg-rose-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                              {rangeLabel}
                            </span>
                            {s.reason && <span className="text-sm text-gray-500 truncate">{s.reason}</span>}
                            {s.documents && s.documents.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap">
                                {s.documents.map((doc) => (
                                  <div key={doc.id} className="inline-flex items-center gap-1">
                                    <a
                                      href={doc.fileUrl}
                                      onClick={(e) => {
                                        e.preventDefault()
                                        setPreviewDocument({
                                          fileName: doc.fileName,
                                          fileUrl: doc.fileUrl
                                        })
                                      }}
                                      className="text-sm text-rose-700 hover:text-rose-900 underline"
                                    >
                                      {doc.fileName}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!confirm('Delete this sick leave document?')) return
                                        try {
                                          const res = await fetch(
                                            `/api/staff/${id}/sick-leave/${s.id}/documents?documentId=${doc.id}`,
                                            { method: 'DELETE' }
                                          )
                                          if (!res.ok) throw new Error('Delete failed')
                                          fetchSickLeaves()
                                        } catch {
                                          alert('Failed to delete sick leave document')
                                        }
                                      }}
                                      className="text-xs text-red-600 hover:text-red-800"
                                      title="Delete document"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <label className="text-xs text-rose-700 hover:text-rose-900 underline cursor-pointer">
                              {uploadingSickLeaveDocId === s.id ? 'Uploading…' : 'Add doc'}
                              <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.pdf"
                                className="hidden"
                                disabled={uploadingSickLeaveDocId === s.id}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  e.currentTarget.value = ''
                                  if (!file) return
                                  setUploadingSickLeaveDocId(s.id)
                                  try {
                                    await uploadSickLeaveDocument(s.id, file)
                                    fetchSickLeaves()
                                    fetchDocuments()
                                  } catch (err) {
                                    alert(
                                      err instanceof Error
                                        ? err.message
                                        : 'Failed to upload sick leave document'
                                    )
                                  } finally {
                                    setUploadingSickLeaveDocId(null)
                                  }
                                }}
                              />
                            </label>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                                statusColors[s.status] ?? 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {s.status}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm('Remove this sick leave record?')) return
                                try {
                                  await fetch(`/api/staff/sick-leave/${s.id}`, { method: 'DELETE' })
                                  fetchSickLeaves()
                                } catch {
                                  alert('Failed to delete')
                                }
                              }}
                              className="text-gray-400 hover:text-red-600 text-sm leading-none"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Documents */}
        {activeTab === 'documents' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Documents{documents.length > 0 ? ` (${documents.length})` : ''}
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateSelection(true)}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50"
                >
                  Generate
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadPanel((open) => !open)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700"
                >
                  {showUploadPanel ? 'Close upload' : '+ New document'}
                </button>
              </div>
            </div>

            {showUploadPanel && (
              <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <StaffDocumentUpload
                  staffId={id}
                  onUploadComplete={() => {
                    fetchDocuments()
                    fetchSickLeaves()
                    setShowUploadPanel(false)
                  }}
                />
              </div>
            )}

            {documents.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No documents yet. Upload a file or generate one.
              </p>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uploaded
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDocument({ fileName: doc.fileName, fileUrl: doc.fileUrl })
                            }
                            className="text-left text-blue-600 hover:text-blue-800"
                          >
                            {doc.fileName}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {documentTypeLabel(doc.type)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {formatShortDate(doc.uploadedAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                          <div className="relative inline-block text-left" data-doc-menu>
                            <button
                              type="button"
                              onClick={() =>
                                setDocumentMenuId((current) => (current === doc.id ? null : doc.id))
                              }
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                              aria-label={`Actions for ${doc.fileName}`}
                              aria-expanded={documentMenuId === doc.id}
                            >
                              ⋯
                            </button>
                            {documentMenuId === doc.id && (
                              <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                                <button
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                  onClick={() => {
                                    setPreviewDocument({
                                      fileName: doc.fileName,
                                      fileUrl: doc.fileUrl
                                    })
                                    setDocumentMenuId(null)
                                  }}
                                >
                                  Preview
                                </button>
                                <a
                                  href={doc.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                  onClick={() => setDocumentMenuId(null)}
                                >
                                  Download
                                </a>
                                <button
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                  onClick={() => {
                                    setDocumentMenuId(null)
                                    void handleDeleteDocument(doc.id)
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Attendance */}
        {activeTab === 'attendance' && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Attendance</h2>
            {editing ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Device user ID
                    </label>
                    <input
                      type="text"
                      value={formData.deviceUserId}
                      onChange={(e) => setFormData({ ...formData, deviceUserId: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. 108"
                    />
                    <p className="text-xs text-gray-500 mt-0.5">
                      Links this staff to ZKTeco attendance device for clock in/out.
                    </p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 sm:col-span-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.punchExempt}
                        onChange={(e) =>
                          setFormData({ ...formData, punchExempt: e.target.checked })
                        }
                        className="mt-1 rounded border-gray-300"
                      />
                      <span>
                        <span className="text-sm font-medium text-gray-900">
                          Punch exemption (no clock)
                        </span>
                        <span className="block text-xs text-gray-600 mt-0.5">
                          Exclude from pay period hours report. Present/absent treats them as present
                          unless marked absent for the day.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
                {editFooter}
              </>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                <FieldDisplay label="Device user ID" value={formData.deviceUserId || null} />
                <FieldDisplay
                  label="Punch exemption"
                  value={formData.punchExempt ? 'Yes — no clock required' : 'No'}
                />
              </dl>
            )}
          </form>
        )}

        {/* Payroll */}
        {activeTab === 'payroll' && canViewStaffSensitive && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Payroll</h2>
            {editing ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                    <BankSelect
                      value={formData.bankName}
                      onChange={(bankName) => setFormData({ ...formData, bankName })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Account number
                    </label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      className={inputClass}
                      placeholder="Bank account number"
                    />
                  </div>
                </div>
                {editFooter}
              </>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                <FieldDisplay label="Bank" value={formData.bankName || null} />
                <FieldDisplay label="Account number" value={formData.accountNumber || null} />
              </dl>
            )}
          </form>
        )}
      </div>

      {showTemplateSelection && (
        <DocumentGenerationModal
          staffId={id}
          staffName={displayName}
          onClose={() => setShowTemplateSelection(false)}
          onGenerate={handleGenerateDocument}
        />
      )}

      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {selectedTemplate.charAt(0).toUpperCase() +
                  selectedTemplate.slice(1).replace('-', ' ')}{' '}
                - {displayName}
              </h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={20}
              className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
              >
                Close
              </button>
              <button
                onClick={handlePrintDocument}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {showVacationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Set vacation</h3>
            <p className="text-sm text-gray-600 mb-4">
              This staff member will not be schedulable in the roster during this period.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                <input
                  type="date"
                  value={vacationStart}
                  onChange={(e) => setVacationStart(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                <input
                  type="date"
                  value={vacationEnd}
                  onChange={(e) => setVacationEnd(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setShowVacationModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
              >
                Cancel
              </button>
              {formData.vacationStart && formData.vacationEnd && (
                <button
                  type="button"
                  onClick={clearVacation}
                  disabled={savingVacation}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded font-semibold hover:bg-red-200 disabled:opacity-60"
                >
                  Clear vacation
                </button>
              )}
              <button
                type="button"
                onClick={saveVacation}
                disabled={savingVacation}
                className="px-4 py-2 bg-amber-600 text-white rounded font-semibold hover:bg-amber-700 disabled:opacity-60"
              >
                {savingVacation ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-base font-semibold text-gray-900 truncate">
                {previewDocument.fileName}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewDocument(null)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close preview"
              >
                ✕
              </button>
            </div>
            <div className="border border-gray-200 rounded bg-gray-50 flex-1 min-h-[60vh] overflow-hidden">
              {isPdfFile(previewDocument.fileUrl, previewDocument.fileName) ? (
                <iframe
                  src={previewDocument.fileUrl}
                  title={previewDocument.fileName}
                  className="w-full h-full min-h-[60vh]"
                />
              ) : (
                <img
                  src={previewDocument.fileUrl}
                  alt={previewDocument.fileName}
                  className="w-full h-full object-contain min-h-[60vh]"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <a
                href={previewDocument.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                Open in new tab
              </a>
              <button
                type="button"
                onClick={() => setPreviewDocument(null)}
                className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EditStaffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      }
    >
      <EditStaffPageInner />
    </Suspense>
  )
}
