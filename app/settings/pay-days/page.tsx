'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface PayDay {
  id: string
  date: string
  notes: string | null
}

export default function PayDaysSettingsPage() {
  const router = useRouter()
  const [list, setList] = useState<PayDay[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const fetchList = () => {
    fetch('/api/pay-days')
      .then((res) => res.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDate.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/pay-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate.trim(), notes: newNotes.trim() || undefined })
      })
      if (res.ok) {
        setNewDate('')
        setNewNotes('')
        fetchList()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to add pay day')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this pay day?')) return
    try {
      const res = await fetch(`/api/pay-days/${id}`, { method: 'DELETE' })
      if (res.ok) fetchList()
      else alert('Failed to delete')
    } catch {
      alert('Failed to delete')
    }
  }

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return dateStr
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Pay Days</h1>
          <button
            onClick={() => router.push('/settings')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            ← Settings
          </button>
        </div>
        <p className="text-gray-600 mb-6">
          Set dates when accounting will process payments. These are the days payments are made, not when staff expect to be paid.
          Reminders are sent via email 3 days before and 1 day before to the default manager/admin recipients. On the pay day itself, a context bar appears in the sidebar.
        </p>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add pay day</h2>
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
                required
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="e.g. March payroll"
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !newDate.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scheduled pay days</h2>
          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-gray-500">No pay days yet. Add one above.</p>
          ) : (
            <ul className="space-y-3">
              {list.map((pd) => (
                <li
                  key={pd.id}
                  className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <span className="font-medium text-gray-900">{formatDate(pd.date)}</span>
                    {pd.notes && <span className="text-gray-600 text-sm ml-2">— {pd.notes}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(pd.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
