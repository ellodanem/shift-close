'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface StaffRole {
  id: string
  name: string
  badgeColor?: string | null
  sortOrder: number
}

export default function StaffRolesPage() {
  const router = useRouter()
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6b7280')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  useEffect(() => {
    loadRoles()
  }, [])

  const loadRoles = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/staff-roles')
      if (!res.ok) throw new Error('Failed to fetch staff roles')
      const data: StaffRole[] = await res.json()
      setRoles(data)
    } catch (err) {
      console.error('Error loading staff roles', err)
      setError('Failed to load staff roles.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) {
      alert('Name is required.')
      return
    }
    try {
      const res = await fetch('/api/staff-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          badgeColor: newColor.trim() || null
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create staff role')
      }
      setNewName('')
      await loadRoles()
    } catch (err) {
      console.error('Error creating staff role', err)
      alert(err instanceof Error ? err.message : 'Failed to create staff role')
    }
  }

  const startEditing = (role: StaffRole) => {
    setEditingId(role.id)
    setEditName(role.name)
    setEditColor(role.badgeColor || '')
  }

  const cancelEditing = () => {
    setEditingId(null)
  }

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/staff-roles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          badgeColor: editColor.trim() || null
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update staff role')
      }
      setEditingId(null)
      await loadRoles()
    } catch (err) {
      console.error('Error updating staff role', err)
      alert(err instanceof Error ? err.message : 'Failed to update staff role')
    }
  }

  const handleDelete = async (role: StaffRole) => {
    const confirmed = window.confirm(
      `Delete role "${role.name}"?\n\nYou cannot delete a role that still has staff assigned.`
    )
    if (!confirmed) return

    try {
      const res = await fetch(`/api/staff-roles/${role.id}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete staff role')
      }
      await loadRoles()
    } catch (err) {
      console.error('Error deleting staff role', err)
      alert(err instanceof Error ? err.message : 'Failed to delete staff role')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Staff Roles</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage roles for staff (e.g. Cashier, Pump Attendant, Supervisor).
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push('/staff')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Staff
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* New role form */}
        <form
          onSubmit={handleCreate}
          className="mb-6 bg-white rounded-lg shadow border border-gray-200 p-4 space-y-3"
        >
          <h2 className="text-sm font-semibold text-gray-800">Add role</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Pump Attendant"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Badge color (optional)
              </label>
              <input
                type="color"
                value={newColor || '#6b7280'}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-10 h-8 border border-gray-300 rounded cursor-pointer"
                title="Pick a badge color"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold text-sm hover:bg-blue-700"
            >
              Add role
            </button>
          </div>
        </form>

        {/* Existing roles */}
        <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
          <div className="px-4 py-2 border-b border-gray-200 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-700">Existing roles</span>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-gray-600">Loading roles…</div>
          ) : roles.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No roles yet. Add one above to get started.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Badge color
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {roles.map((role) => {
                  const isEditing = editingId === role.id
                  return (
                    <tr key={role.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        ) : (
                          <span className="font-medium text-gray-900">{role.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {isEditing ? (
                          <input
                            type="color"
                            value={editColor || role.badgeColor || '#6b7280'}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="w-8 h-7 border border-gray-300 rounded cursor-pointer"
                            title="Pick a badge color"
                          />
                        ) : role.badgeColor ? (
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-block w-3 h-3 rounded-full border border-gray-300"
                              style={{ backgroundColor: role.badgeColor }}
                            />
                            <span className="text-xs text-gray-600">{role.badgeColor}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Default</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        {isEditing ? (
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(role.id)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex gap-3">
                            <button
                              type="button"
                              onClick={() => startEditing(role)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(role)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

