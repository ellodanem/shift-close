'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import StaffDocumentUpload from './StaffDocumentUpload'
import DocumentGenerationModal from './DocumentGenerationModal'

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

interface StaffDayOff {
  id: string
  date: string
  reason?: string | null
  status: string
}

export default function EditStaffPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    startDate: '',
    status: 'active',
    roleId: '',
    nicNumber: '',
    deviceUserId: '',
    bankName: '',
    accountNumber: '',
    mobileNumber: '',
    notes: '',
    vacationStart: '' as string,
    vacationEnd: '' as string
  })
  const displayName = [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim() || 'Staff'
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shiftCount, setShiftCount] = useState(0)
  const [documents, setDocuments] = useState<StaffDocument[]>([])
  const [dayOffs, setDayOffs] = useState<StaffDayOff[]>([])
  const [dayOffDate, setDayOffDate] = useState('')
  const [dayOffReason, setDayOffReason] = useState('')
  const [savingDayOff, setSavingDayOff] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showTemplateSelection, setShowTemplateSelection] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [showVacationModal, setShowVacationModal] = useState(false)
  const [vacationStart, setVacationStart] = useState('')
  const [vacationEnd, setVacationEnd] = useState('')
  const [savingVacation, setSavingVacation] = useState(false)

  useEffect(() => {
    // Fetch available roles first
    fetch('/api/staff-roles')
      .then(res => res.json())
      .then((data: StaffRole[]) => {
        setRoles(data)
        setLoadingRoles(false)
        // Then fetch staff data
        fetchStaff()
      })
      .catch(err => {
        console.error('Error fetching roles:', err)
        setLoadingRoles(false)
        fetchStaff()
      })
    
    fetchDocuments()
    fetchDayOffs()
    
    // Check if generate parameter is in URL - show template selection modal instead of auto-generating
    const params = new URLSearchParams(window.location.search)
    const generate = params.get('generate')
    if (generate) {
      setShowTemplateSelection(true)
      // Clean up URL
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
      setFormData({
        firstName: first,
        lastName: last,
        dateOfBirth: data.dateOfBirth || '',
        startDate: data.startDate || '',
        status: data.status,
        roleId: data.roleId || '',
        nicNumber: (data as any).nicNumber || '',
        deviceUserId: (data as any).deviceUserId || '',
        bankName: (data as any).bankName || '',
        accountNumber: (data as any).accountNumber || '',
        mobileNumber: (data as any).mobileNumber || '',
        notes: data.notes,
        vacationStart: (data as any).vacationStart || '',
        vacationEnd: (data as any).vacationEnd || ''
      })
      setShiftCount(data._count?.shifts || 0)
    } catch (error) {
      console.error('Error fetching staff:', error)
      setError('Failed to load staff member')
    } finally {
      setLoading(false)
    }
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

      router.push('/staff')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update staff')
    } finally {
      setSaving(false)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Edit Staff Member</h1>
          <button
            onClick={() => router.push('/staff')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>

        {/* Shift Count Warning */}
        {shiftCount > 0 && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
            This staff member is referenced by {shiftCount} shift(s). Changes will affect future shifts only.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* First name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="First name"
              />
            </div>
            {/* Last name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Last name"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              {loadingRoles ? (
                <div className="w-full border border-gray-300 rounded px-3 py-2 bg-gray-50 text-gray-500">
                  Loading roles...
                </div>
              ) : (
                <select
                  required
                  value={formData.roleId}
                  onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {roles.length === 0 && (
                    <option value="">No roles available</option>
                  )}
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Vacation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vacation
              </label>
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
                className="mt-2 px-3 py-1.5 text-sm border border-amber-600 text-amber-700 rounded font-medium hover:bg-amber-50"
              >
                {formData.vacationStart && formData.vacationEnd ? 'Change vacation' : 'Set vacation'}
              </button>
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Mobile (WhatsApp) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mobile (WhatsApp)
              </label>
              <input
                type="tel"
                value={formData.mobileNumber}
                onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. +1 242 555 1234 or 12425551234"
              />
              <p className="text-xs text-gray-500 mt-0.5">Used to send roster via WhatsApp (wa.me). Include country code.</p>
            </div>

            {/* Device User ID (ZKTeco attendance) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Device User ID (Attendance)
              </label>
              <input
                type="text"
                value={formData.deviceUserId}
                onChange={(e) => setFormData({ ...formData, deviceUserId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 108 (matches ZKTeco device user ID)"
              />
              <p className="text-xs text-gray-500 mt-0.5">Links this staff to ZKTeco attendance device for clock in/out.</p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Additional notes about this staff member"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-6 flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push('/staff')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Day Off Requests Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Day Off Requests</h2>

          {/* Add new request form */}
          <div className="flex gap-3 items-end mb-5">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={dayOffDate}
                onChange={e => setDayOffDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={dayOffReason}
                onChange={e => setDayOffReason(e.target.value)}
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

          {/* Requests list */}
          {dayOffs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No day off requests recorded.</p>
          ) : (
            <div className="space-y-2">
              {[...dayOffs].sort((a, b) => b.date.localeCompare(a.date)).map(d => {
                const isPast = d.date < new Date().toISOString().slice(0, 10)
                const statusColors: Record<string, string> = {
                  approved: 'bg-green-100 text-green-800',
                  denied: 'bg-red-100 text-red-800',
                  requested: 'bg-yellow-100 text-yellow-800'
                }
                return (
                  <div key={d.id} className={`flex items-center justify-between px-3 py-2 rounded border ${isPast ? 'border-gray-200 bg-gray-50' : 'border-blue-100 bg-blue-50'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{d.date}</span>
                      {d.reason && <span className="text-sm text-gray-500 truncate">{d.reason}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusColors[d.status] ?? 'bg-gray-100 text-gray-700'}`}>
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

        {/* Documents Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-700">Documents</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplateSelection(true)}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700"
              >
                Generate Document
              </button>
            </div>
          </div>

          <StaffDocumentUpload staffId={id} onUploadComplete={fetchDocuments} />

          {documents.length > 0 && (
            <div className="mt-4 space-y-2">
              {documents.map((doc) => {
                const getTypeLabel = (type: string) => {
                  const labels: Record<string, string> = {
                    'sick-leave': 'Sick Leave',
                    'contract': 'Contract',
                    'id': 'ID/Passport',
                    'other': 'Other'
                  }
                  return labels[type] || type
                }

                const formatDate = (dateStr: string) => {
                  return new Date(dateStr).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })
                }

                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {doc.fileUrl.endsWith('.pdf') ? '📄' : '🖼️'}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{doc.fileName}</div>
                        <div className="text-xs text-gray-500">
                          {getTypeLabel(doc.type)} • Uploaded {formatDate(doc.uploadedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View
                      </a>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Template Selection Modal */}
      {showTemplateSelection && (
        <DocumentGenerationModal
          staffId={id}
          staffName={displayName}
          onClose={() => setShowTemplateSelection(false)}
          onGenerate={handleGenerateDocument}
        />
      )}

      {/* Document Generation Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1).replace('-', ' ')} - {displayName}
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

      {/* Vacation Modal */}
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
    </div>
  )
}

