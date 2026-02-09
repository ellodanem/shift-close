'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ShiftTemplate {
  id: string
  name: string
  startTime: string
  endTime: string
  color?: string | null
  sortOrder: number
}

export default function ShiftTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newStartTime, setNewStartTime] = useState('06:00')
  const [newEndTime, setNewEndTime] = useState('13:00')
  const [newColor, setNewColor] = useState('#2563eb')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editStartTime, setEditStartTime] = useState('')
  const [editEndTime, setEditEndTime] = useState('')
  const [editColor, setEditColor] = useState('')

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/roster/templates')
      if (!res.ok) throw new Error('Failed to fetch shift presets')
      const data: ShiftTemplate[] = await res.json()
      setTemplates(data)
    } catch (err) {
      console.error('Error loading shift templates', err)
      setError('Failed to load shift presets.')
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
      const res = await fetch('/api/roster/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          startTime: newStartTime,
          endTime: newEndTime,
          color: newColor.trim() || null
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create shift preset')
      }
      setNewName('')
      setNewColor('')
      await loadTemplates()
    } catch (err) {
      console.error('Error creating shift template', err)
      alert(err instanceof Error ? err.message : 'Failed to create shift preset')
    }
  }

  const startEditing = (tmpl: ShiftTemplate) => {
    setEditingId(tmpl.id)
    setEditName(tmpl.name)
    setEditStartTime(tmpl.startTime)
    setEditEndTime(tmpl.endTime)
    setEditColor(tmpl.color || '')
  }

  const cancelEditing = () => {
    setEditingId(null)
  }

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/roster/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          startTime: editStartTime,
          endTime: editEndTime,
          color: editColor.trim() || null
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update shift preset')
      }
      setEditingId(null)
      await loadTemplates()
    } catch (err) {
      console.error('Error updating shift template', err)
      alert(err instanceof Error ? err.message : 'Failed to update shift preset')
    }
  }

  const handleDelete = async (tmpl: ShiftTemplate) => {
    const confirmed = window.confirm(
      `Delete shift preset "${tmpl.name}"?\n\nThis will not affect saved rosters, but future assignments will no longer be able to use it.`
    )
    if (!confirmed) return

    try {
      const res = await fetch(`/api/roster/templates/${tmpl.id}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete shift preset')
      }
      await loadTemplates()
    } catch (err) {
      console.error('Error deleting shift template', err)
      alert(err instanceof Error ? err.message : 'Failed to delete shift preset')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Shift Presets</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage reusable shift presets for the roster (e.g. 6-1, 1-9, 7:30–2).
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

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* New preset form */}
        <form
          onSubmit={handleCreate}
          className="mb-6 bg-white rounded-lg shadow border border-gray-200 p-4 space-y-3"
        >
          <h2 className="text-sm font-semibold text-gray-800">Add shift preset</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. 6-1"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Start time
              </label>
              <input
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                End time
              </label>
              <input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Color (optional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor || '#2563eb'}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-10 h-8 border border-gray-300 rounded"
                  title="Pick a color"
                />
                <input
                  type="text"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  placeholder="#2563eb"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                You can pick a color or type a custom hex code.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold text-sm hover:bg-blue-700"
            >
              Add preset
            </button>
          </div>
        </form>

        {/* Existing presets */}
        <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
          <div className="px-4 py-2 border-b border-gray-200 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-700">Existing presets</span>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-gray-600">Loading shift presets…</div>
          ) : templates.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No shift presets yet. Add one above to get started.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Color
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {templates.map((tmpl) => {
                  const isEditing = editingId === tmpl.id
                  return (
                    <tr key={tmpl.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        ) : (
                          <span className="font-medium text-gray-900">{tmpl.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <input
                              type="time"
                              value={editStartTime}
                              onChange={(e) => setEditStartTime(e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                            <span className="text-xs text-gray-400">to</span>
                            <input
                              type="time"
                              value={editEndTime}
                              onChange={(e) => setEditEndTime(e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                        ) : (
                          `${tmpl.startTime} – ${tmpl.endTime}`
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={editColor || tmpl.color || '#2563eb'}
                              onChange={(e) => setEditColor(e.target.value)}
                              className="w-8 h-7 border border-gray-300 rounded"
                              title="Pick a color"
                            />
                            <input
                              type="text"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                              placeholder="#2563eb"
                            />
                          </div>
                        ) : tmpl.color ? (
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-block w-3 h-3 rounded-full border border-gray-300"
                              style={{ backgroundColor: tmpl.color }}
                            />
                            <span className="text-xs text-gray-600">{tmpl.color}</span>
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
                              onClick={() => saveEdit(tmpl.id)}
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
                              onClick={() => startEditing(tmpl)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(tmpl)}
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

