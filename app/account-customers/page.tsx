'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AccountCustomer {
  customerName: string
  balance: number
  isOverride: boolean
  paymentMethod?: string
  lastActivity?: string
  notes?: string | null
}

export default function AccountCustomersPage() {
  const router = useRouter()
  const [list, setList] = useState<AccountCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBalance, setEditBalance] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBalance, setNewBalance] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchList = () => {
    fetch('/api/account-customers')
      .then((res) => res.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
  }, [])

  const handleSetBalance = (c: AccountCustomer) => {
    setEditing(c.customerName)
    setEditBalance(c.balance.toFixed(2))
    setEditNotes(c.notes || '')
  }

  const handleSaveBalance = async () => {
    if (!editing) return
    const bal = parseFloat(editBalance)
    if (Number.isNaN(bal) || bal < 0) {
      alert('Enter a valid balance (≥ 0)')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/account-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: editing,
          balance: bal,
          notes: editNotes.trim() || undefined
        })
      })
      if (res.ok) {
        setEditing(null)
        fetchList()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveOverride = async (name: string) => {
    if (!confirm(`Remove balance override for ${name}? Balance will revert to computed from shift items.`)) return
    try {
      const res = await fetch(`/api/account-customers/${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (res.ok) fetchList()
      else alert('Failed to remove override')
    } catch {
      alert('Failed to remove override')
    }
  }

  const handleAddCustomer = async () => {
    if (!newName.trim()) {
      alert('Customer name is required')
      return
    }
    const bal = parseFloat(newBalance)
    if (Number.isNaN(bal) || bal < 0) {
      alert('Enter a valid balance (≥ 0)')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/account-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: newName.trim(), balance: bal })
      })
      if (res.ok) {
        setNewName('')
        setNewBalance('')
        fetchList()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to add')
      }
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Account Customers</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage cheque/debit account customers from shift activity. Set current balance to start fresh — new items build on top.
            </p>
          </div>
          <button
            onClick={() => router.push('/financial/cashbook')}
            className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
          >
            ← Financial
          </button>
        </div>

        {/* Add new customer */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Add customer & set balance</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Rumie Tours"
                className="border border-gray-300 rounded px-3 py-2 w-48"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Balance ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder="0.00"
                className="border border-gray-300 rounded px-3 py-2 w-28"
              />
            </div>
            <button
              onClick={handleAddCustomer}
              disabled={adding || !newName.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Customers</h2>
          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-gray-500">No customers yet. Add one above or record account activity in a shift.</p>
          ) : (
            <div className="space-y-2">
              {list.map((c) => (
                <div
                  key={c.customerName}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <div className="font-medium text-gray-900">{c.customerName}</div>
                    <div className="text-xs text-gray-500">
                      {c.isOverride ? (
                        <span className="text-amber-600">Manual balance</span>
                      ) : (
                        <>From shift items{c.lastActivity && ` · ${c.lastActivity}`}</>
                      )}
                      {c.paymentMethod && ` · ${c.paymentMethod}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900 w-20 text-right">
                      ${c.balance.toFixed(2)}
                    </span>
                    {editing === c.customerName ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editBalance}
                          onChange={(e) => setEditBalance(e.target.value)}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Notes"
                          className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                        <button
                          onClick={handleSaveBalance}
                          disabled={saving}
                          className="px-2 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="px-2 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleSetBalance(c)}
                          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Update balance
                        </button>
                        {c.isOverride && (
                          <button
                            onClick={() => handleRemoveOverride(c.customerName)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Remove override
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
