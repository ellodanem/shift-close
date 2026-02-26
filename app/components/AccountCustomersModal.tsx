'use client'

import { useEffect, useState } from 'react'

export interface AccountCustomer {
  customerName: string
  balance: number
  isOverride: boolean
  paymentMethod?: string
  lastActivity?: string
  notes?: string | null
}

interface AccountCustomersModalProps {
  open: boolean
  onClose: () => void
}

export default function AccountCustomersModal({ open, onClose }: AccountCustomersModalProps) {
  const [list, setList] = useState<AccountCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBalance, setEditBalance] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState('')
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
    if (open) {
      setLoading(true)
      fetchList()
    }
  }, [open])

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

  const handleStartEditName = (c: AccountCustomer) => {
    setEditingName(c.customerName)
    setEditNameValue(c.customerName)
  }

  const handleSaveName = async () => {
    if (!editingName || !editNameValue.trim()) return
    if (editNameValue.trim() === editingName) {
      setEditingName(null)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/account-customers/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: editingName, newName: editNameValue.trim() })
      })
      if (res.ok) {
        setEditingName(null)
        fetchList()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to rename')
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

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-gray-900">Manage Account Customers</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Add customer */}
          <div className="border border-gray-200 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Add customer & set balance</h4>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Rumie Tours"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-36"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Balance ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  placeholder="0.00"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24"
                />
              </div>
              <button
                onClick={handleAddCustomer}
                disabled={adding || !newName.trim()}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>

          {/* List */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Customers</h4>
            {loading ? (
              <p className="text-gray-500 text-sm">Loading…</p>
            ) : list.length === 0 ? (
              <p className="text-gray-500 text-sm">No customers yet. Add one above or record activity in a shift.</p>
            ) : (
              <div className="space-y-1.5">
                {list.map((c) => (
                  <div
                    key={c.customerName}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      {editingName === c.customerName ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input
                            type="text"
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-sm w-36"
                            autoFocus
                          />
                          <button onClick={handleSaveName} disabled={saving || !editNameValue.trim()} className="px-2 py-0.5 bg-green-600 text-white text-xs rounded">Save</button>
                          <button onClick={() => setEditingName(null)} className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium text-gray-900 truncate">
                            {c.customerName}
                            <button onClick={() => handleStartEditName(c)} className="ml-1 text-indigo-600 hover:text-indigo-800 text-xs">Edit</button>
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {c.isOverride ? <span className="text-amber-600">Manual</span> : <>From items{c.lastActivity && ` · ${c.lastActivity}`}</>}
                            {c.paymentMethod && ` · ${c.paymentMethod}`}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-semibold text-gray-900 w-16 text-right">${c.balance.toFixed(2)}</span>
                      {editing === c.customerName ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editBalance}
                            onChange={(e) => setEditBalance(e.target.value)}
                            className="w-20 border border-gray-300 rounded px-1.5 py-0.5 text-sm"
                          />
                          <button onClick={handleSaveBalance} disabled={saving} className="px-1.5 py-0.5 bg-green-600 text-white text-xs rounded">Save</button>
                          <button onClick={() => setEditing(null)} className="px-1.5 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => handleSetBalance(c)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Update</button>
                          {c.isOverride && (
                            <button onClick={() => handleRemoveOverride(c.customerName)} className="text-red-600 hover:text-red-800 text-xs">Remove</button>
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
    </div>
  )
}
