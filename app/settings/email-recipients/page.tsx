'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface EmailRecipient {
  id: string
  label: string
  email: string
  mobileNumber?: string | null
  sortOrder: number
}

export default function EmailRecipientsSettingsPage() {
  const router = useRouter()
  const [list, setList] = useState<EmailRecipient[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newMobile, setNewMobile] = useState('')
  const [editingMobileId, setEditingMobileId] = useState<string | null>(null)
  const [editingMobileValue, setEditingMobileValue] = useState('')

  const fetchList = () => {
    fetch('/api/email-recipients')
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
    if (!newLabel.trim() || !newEmail.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/email-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim(), email: newEmail.trim(), mobileNumber: newMobile.trim() || null })
      })
      if (res.ok) {
        setNewLabel('')
        setNewEmail('')
        setNewMobile('')
        fetchList()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to add recipient')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSaveMobile = async (id: string) => {
    try {
      const res = await fetch(`/api/email-recipients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileNumber: editingMobileValue.trim() || null })
      })
      if (res.ok) {
        setEditingMobileId(null)
        setEditingMobileValue('')
        fetchList()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to update')
      }
    } catch {
      alert('Failed to update')
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this recipient from the list?')) return
    try {
      const res = await fetch(`/api/email-recipients/${id}`, { method: 'DELETE' })
      if (res.ok) fetchList()
      else alert('Failed to delete')
    } catch {
      alert('Failed to delete')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Email recipients</h1>
          <button
            onClick={() => router.push('/settings')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            ← Settings
          </button>
        </div>
        <p className="text-gray-600 mb-6">
          These recipients appear in the &quot;Email report&quot; dropdown. Add a mobile number (E.164, e.g. +12465551234) for WhatsApp reminders.
        </p>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add recipient</h2>
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label (e.g. Mr. Elcock)</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Mr. Elcock"
                className="border border-gray-300 rounded px-3 py-2 w-48"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@example.com"
                className="border border-gray-300 rounded px-3 py-2 w-56"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile (WhatsApp)</label>
              <input
                type="tel"
                value={newMobile}
                onChange={(e) => setNewMobile(e.target.value)}
                placeholder="+12465551234"
                className="border border-gray-300 rounded px-3 py-2 w-40"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !newLabel.trim() || !newEmail.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Current list</h2>
          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-gray-500">No recipients yet. Add one above to use in the email dropdown.</p>
          ) : (
            <ul className="space-y-3">
              {list.map((r) => (
                <li
                  key={r.id}
                  className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <span className="font-medium text-gray-900">{r.label}</span>
                    <span className="text-gray-600 text-sm ml-2">{r.email}</span>
                    {r.mobileNumber && !editingMobileId && (
                      <span className="text-green-600 text-xs ml-2">WhatsApp ✓</span>
                    )}
                    {editingMobileId === r.id ? (
                      <span className="ml-2 inline-flex gap-1">
                        <input
                          type="tel"
                          value={editingMobileValue}
                          onChange={(e) => setEditingMobileValue(e.target.value)}
                          placeholder="+12465551234"
                          className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
                          autoFocus
                        />
                        <button type="button" onClick={() => handleSaveMobile(r.id)} className="text-blue-600 text-xs">Save</button>
                        <button type="button" onClick={() => { setEditingMobileId(null); setEditingMobileValue('') }} className="text-gray-500 text-xs">Cancel</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setEditingMobileId(r.id); setEditingMobileValue(r.mobileNumber || '') }}
                        className="text-blue-600 text-xs ml-2 hover:underline"
                      >
                        {r.mobileNumber ? 'Edit mobile' : 'Add mobile'}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
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
