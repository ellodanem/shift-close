'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DocumentGenerationModal from './DocumentGenerationModal'

interface Staff {
  id: string
  name: string
  /** ZKTeco / attendance device user id */
  deviceUserId: string | null
  dateOfBirth: string | null
  startDate: string | null
  status: string
  role: string
  roleId: string | null
  staffRole?: { id: string; name: string; badgeColor: string | null } | null
  notes: string
}

function StaffTable({
  members,
  getRoleDisplayName,
  getRoleColor,
  getStatusColor,
  onEdit,
  onGenerate,
  onDelete
}: {
  members: Staff[]
  getRoleDisplayName: (member: Staff) => string
  getRoleColor: (roleName: string) => string
  getStatusColor: (status: string) => string
  onEdit: (id: string) => void
  onGenerate: (id: string) => void
  onDelete: (id: string, name: string) => void
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Role
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date of Birth
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Start Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Device user ID
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {members.map((member) => (
            <tr key={member.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{member.name}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(getRoleDisplayName(member))}`}
                >
                  {getRoleDisplayName(member)}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(member.status)}`}>
                  {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {member.dateOfBirth || '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {member.startDate || '-'}
              </td>
              <td
                className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono tabular-nums"
                title="ZKTeco attendance device user ID"
              >
                {member.deviceUserId?.trim() || '—'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button
                  onClick={() => onGenerate(member.id)}
                  className="text-green-600 hover:text-green-900 mr-4"
                  title="Generate Document"
                >
                  📄
                </button>
                <button onClick={() => onEdit(member.id)} className="text-blue-600 hover:text-blue-900 mr-4">
                  Edit
                </button>
                <button
                  onClick={() => onDelete(member.id, member.name)}
                  className="text-red-600 hover:text-red-900"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function StaffPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [inactiveExpanded, setInactiveExpanded] = useState(false)
  const [generateTarget, setGenerateTarget] = useState<{ id: string; name: string } | null>(null)
  const [showGeneratedPreview, setShowGeneratedPreview] = useState(false)
  const [generatedContent, setGeneratedContent] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [previewStaffName, setPreviewStaffName] = useState('')

  useEffect(() => {
    fetchStaff()
  }, [])

  const fetchStaff = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/staff')
      if (!res.ok) {
        throw new Error('Failed to fetch staff')
      }
      const data = await res.json()
      setStaff(data)
    } catch (error) {
      console.error('Error fetching staff:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenGenerate = (id: string) => {
    const member = staff.find((s) => s.id === id)
    if (member) {
      setGenerateTarget({ id: member.id, name: member.name })
    }
  }

  const handleGenerateDocument = async (templateType: string) => {
    if (!generateTarget) return

    try {
      const res = await fetch(`/api/staff/${generateTarget.id}/generate-document`, {
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
      setPreviewStaffName(generateTarget.name)
      setShowGeneratedPreview(true)
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
            <title>${selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1)} - ${previewStaffName}</title>
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

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) {
      return
    }

    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to delete staff')
        return
      }

      // Refresh the list
      fetchStaff()
    } catch (error) {
      console.error('Error deleting staff:', error)
      alert('Failed to delete staff')
    }
  }

  const getStatusColor = (status: string) => {
    return status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
  }

  const getRoleColor = (roleName: string) => {
    const key = roleName?.toLowerCase() || ''
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-800',
      manager: 'bg-blue-100 text-blue-800',
      supervisor: 'bg-yellow-100 text-yellow-800',
      cashier: 'bg-gray-100 text-gray-800',
      'pump attendant': 'bg-emerald-100 text-emerald-800'
    }
    return colors[key] || 'bg-gray-100 text-gray-800'
  }

  const getRoleDisplayName = (member: Staff) =>
    member.staffRole?.name ?? (member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : '—')

  const activeStaff = staff.filter((m) => m.status === 'active')
  const inactiveStaff = staff.filter((m) => m.status !== 'active')

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Staff Management</h1>
          <button
            onClick={() => router.push('/staff/new')}
            className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
          >
            Add Staff Member
          </button>
        </div>

        {/* Active staff */}
        {staff.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-500 mb-4">No staff members found.</p>
            <button
              onClick={() => router.push('/staff/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Add First Staff Member
            </button>
          </div>
        ) : activeStaff.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No active staff members.</p>
          </div>
        ) : (
          <StaffTable
            members={activeStaff}
            getRoleDisplayName={getRoleDisplayName}
            getRoleColor={getRoleColor}
            getStatusColor={getStatusColor}
            onEdit={(id) => router.push(`/staff/${id}`)}
            onGenerate={handleOpenGenerate}
            onDelete={handleDelete}
          />
        )}

        {/* Inactive staff (collapsed by default) */}
        {inactiveStaff.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setInactiveExpanded((open) => !open)}
              aria-expanded={inactiveExpanded}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-gray-50"
            >
              <span className="text-sm font-semibold text-gray-700">
                Inactive staff ({inactiveStaff.length})
              </span>
              <span className="text-gray-400" aria-hidden="true">
                {inactiveExpanded ? '▾' : '▸'}
              </span>
            </button>
            {inactiveExpanded && (
              <div className="mt-3">
                <StaffTable
                  members={inactiveStaff}
                  getRoleDisplayName={getRoleDisplayName}
                  getRoleColor={getRoleColor}
                  getStatusColor={getStatusColor}
                  onEdit={(id) => router.push(`/staff/${id}`)}
                  onGenerate={handleOpenGenerate}
                  onDelete={handleDelete}
                />
              </div>
            )}
          </div>
        )}

        {generateTarget && (
          <DocumentGenerationModal
            staffId={generateTarget.id}
            staffName={generateTarget.name}
            onClose={() => setGenerateTarget(null)}
            onGenerate={handleGenerateDocument}
          />
        )}

        {showGeneratedPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1).replace('-', ' ')} -{' '}
                  {previewStaffName}
                </h3>
                <button
                  onClick={() => setShowGeneratedPreview(false)}
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
                  onClick={() => setShowGeneratedPreview(false)}
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
    </div>
  )
}

