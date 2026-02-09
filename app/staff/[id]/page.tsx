'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import StaffDocumentUpload from './StaffDocumentUpload'
import DocumentGenerationModal from './DocumentGenerationModal'

interface Staff {
  id: string
  name: string
  dateOfBirth: string | null
  startDate: string | null
  status: string
  role: string
  roleId: string | null
  notes: string
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

export default function EditStaffPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [formData, setFormData] = useState({
    name: '',
    dateOfBirth: '',
    startDate: '',
    status: 'active',
    roleId: '',
    nicNumber: '',
    bankName: '',
    accountNumber: '',
    notes: ''
  })
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shiftCount, setShiftCount] = useState(0)
  const [documents, setDocuments] = useState<StaffDocument[]>([])
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showTemplateSelection, setShowTemplateSelection] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')

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
            <title>${selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1)} - ${formData.name}</title>
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
      setFormData({
        name: data.name,
        dateOfBirth: data.dateOfBirth || '',
        startDate: data.startDate || '',
        status: data.status,
        roleId: data.roleId || '',
        nicNumber: (data as any).nicNumber || '',
        bankName: (data as any).bankName || '',
        accountNumber: (data as any).accountNumber || '',
        notes: data.notes
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
          startDate: formData.startDate || null
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
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter full name"
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
          staffName={formData.name}
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
                {selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1).replace('-', ' ')} - {formData.name}
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
    </div>
  )
}

