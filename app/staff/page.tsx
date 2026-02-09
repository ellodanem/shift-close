'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Staff {
  id: string
  name: string
  dateOfBirth: string | null
  startDate: string | null
  status: string
  role: string
  notes: string
}

export default function StaffPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)

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

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-800',
      manager: 'bg-blue-100 text-blue-800',
      supervisor: 'bg-yellow-100 text-yellow-800',
      cashier: 'bg-gray-100 text-gray-800'
    }
    return colors[role] || 'bg-gray-100 text-gray-800'
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Staff Management</h1>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/settings')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
              title="Settings"
            >
              ⚙️
            </button>
            <button
              onClick={() => router.push('/staff/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Add Staff Member
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push('/roster')}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
            >
              Roster
            </button>
            <button
              onClick={() => router.push('/shifts')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Back to Shifts
            </button>
          </div>
        </div>

        {/* Staff List */}
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
        ) : (
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {staff.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{member.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(member.role)}`}>
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          // Navigate to edit page and show template selection modal
                          router.push(`/staff/${member.id}?generate=true`)
                        }}
                        className="text-green-600 hover:text-green-900 mr-4"
                        title="Generate Document"
                      >
                        📄
                      </button>
                      <button
                        onClick={() => router.push(`/staff/${member.id}`)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(member.id, member.name)}
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
        )}
      </div>
    </div>
  )
}

