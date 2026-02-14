'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'eft', label: 'EFT' },
  { value: 'direct_debit', label: 'Direct debit' },
  { value: 'debit_credit', label: 'Debit/Credit' }
] as const

interface CashbookCategory {
  id: string
  name: string
  code: string | null
  type: string
}

interface CashbookApiAllocation {
  id: string
  amount: number
  category: CashbookCategory
}

interface CashbookApiEntry {
  id: string
  date: string
  ref: string | null
  description: string
  debitCash: number
  debitCheck?: number
  debitEcard: number
  debitDcard: number
  creditAmt: number
  paymentMethod?: string | null
  allocations: CashbookApiAllocation[]
}

interface EntryForm {
  date: string
  ref: string
  description: string
  categoryId: string
  amount: number
  paymentMethod: string
}

function formatMonthInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function firstOfMonth(month: string): string {
  return `${month}-01`
}

function lastOfMonth(month: string): string {
  const [yearStr, monthStr] = month.split('-')
  const y = Number(yearStr)
  const m = Number(monthStr)
  if (!y || !m) return month
  const date = new Date(y, m, 0)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

function inferType(entry: CashbookApiEntry): 'income' | 'expense' {
  if ((entry.creditAmt ?? 0) > 0) return 'income'
  return 'expense'
}

function inferAmount(entry: CashbookApiEntry): number {
  const alloc = entry.allocations[0]
  if (alloc) return alloc.amount
  if ((entry.creditAmt ?? 0) > 0) return entry.creditAmt
  return (entry.debitCash ?? 0) + (entry.debitCheck ?? 0) + (entry.debitEcard ?? 0) + (entry.debitDcard ?? 0)
}

function inferPaymentMethod(entry: CashbookApiEntry): string {
  if (entry.paymentMethod) return entry.paymentMethod
  if ((entry.debitCheck ?? 0) > 0) return 'check'
  if ((entry.debitEcard ?? 0) > 0) return 'eft'
  if ((entry.debitDcard ?? 0) > 0) return 'debit_credit'
  return 'cash'
}

function isBankChargesCategory(categoryId: string, categories: CashbookCategory[]): boolean {
  const cat = categories.find((c) => c.id === categoryId)
  return !!cat && /bank\s*charges?/i.test(cat.name)
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatPaymentLabel(value: string): string {
  const opt = PAYMENT_OPTIONS.find((o) => o.value === value)
  return opt?.label ?? value
}

const emptyForm: EntryForm = {
  date: '',
  ref: '',
  description: '',
  categoryId: '',
  amount: 0,
  paymentMethod: 'cash'
}

export default function CashbookPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<CashbookCategory[]>([])
  const [entries, setEntries] = useState<CashbookApiEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState<string>(() => formatMonthInput(new Date()))
  const [modalOpen, setModalOpen] = useState<'income' | 'expense' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EntryForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatCode, setNewCatCode] = useState('')
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense')

  const dateRange = useMemo(
    () => ({ startDate: firstOfMonth(month), endDate: lastOfMonth(month) }),
    [month]
  )

  const incomeCategories = useMemo(() => categories.filter((c) => c.type === 'income'), [categories])
  const expenseCategories = useMemo(() => categories.filter((c) => c.type === 'expense'), [categories])

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [catRes, entryRes] = await Promise.all([
          fetch('/api/financial/cashbook/categories'),
          fetch(
            `/api/financial/cashbook/entries?startDate=${encodeURIComponent(dateRange.startDate)}&endDate=${encodeURIComponent(dateRange.endDate)}`
          )
        ])
        if (!catRes.ok) throw new Error('Failed to load categories')
        if (!entryRes.ok) throw new Error('Failed to load entries')
        const catData: CashbookCategory[] = await catRes.json()
        setCategories(catData)
        const entryData: CashbookApiEntry[] = await entryRes.json()
        setEntries(entryData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load cashbook')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [dateRange.startDate, dateRange.endDate])

  const openAddModal = (type: 'income' | 'expense') => {
    setModalOpen(type)
    setEditingId(null)
    const cats = type === 'income' ? incomeCategories : expenseCategories
    setForm({
      ...emptyForm,
      date: dateRange.startDate,
      categoryId: cats[0]?.id ?? '',
      paymentMethod: 'cash'
    })
  }

  const openEditModal = (entry: CashbookApiEntry) => {
    const type = inferType(entry)
    setModalOpen(type)
    setEditingId(entry.id)
    const alloc = entry.allocations[0]
    setForm({
      date: entry.date,
      ref: entry.ref ?? '',
      description: entry.description ?? '',
      categoryId: alloc?.category.id ?? '',
      amount: inferAmount(entry),
      paymentMethod: type === 'expense' ? inferPaymentMethod(entry) : 'cash'
    })
  }

  const closeModal = () => {
    setModalOpen(null)
    setEditingId(null)
    setForm(emptyForm)
  }

  const saveEntry = async () => {
    if (!form.date || !form.description.trim() || !form.categoryId) {
      alert('Date, Description and Category are required.')
      return
    }
    const amt = Number(form.amount) || 0
    if (amt <= 0) {
      alert('Amount must be greater than 0.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        date: form.date,
        ref: form.ref.trim() || null,
        description: form.description.trim(),
        type: modalOpen!,
        paymentMethod: modalOpen === 'expense' ? form.paymentMethod : null,
        categoryId: form.categoryId,
        amount: amt
      }

      if (editingId) {
        const res = await fetch(`/api/financial/cashbook/entries/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error('Failed to update')
      } else {
        const res = await fetch('/api/financial/cashbook/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error('Failed to create')
      }

      closeModal()
      // Reload entries
      const entryRes = await fetch(
        `/api/financial/cashbook/entries?startDate=${encodeURIComponent(dateRange.startDate)}&endDate=${encodeURIComponent(dateRange.endDate)}`
      )
      if (entryRes.ok) {
        const data: CashbookApiEntry[] = await entryRes.json()
        setEntries(data)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/financial/cashbook/entries/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleAddCategory = async () => {
    if (!newCatName.trim()) {
      alert('Category name is required.')
      return
    }
    try {
      const res = await fetch('/api/financial/cashbook/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName.trim(),
          code: newCatCode.trim() || null,
          type: newCatType
        })
      })
      if (!res.ok) throw new Error('Failed to create category')
      const created: CashbookCategory = await res.json()
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCatName('')
      setNewCatCode('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create category')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading cashbook…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cashbook</h1>
            <p className="text-sm text-gray-600 mt-1">
              Track income and expenses. Your accountant can read the full details.
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Month:</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <button
              onClick={() => router.push('/reports/financial')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold text-sm hover:bg-indigo-700"
            >
              Financial Report
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Add Income / Add Expense */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={() => openAddModal('income')}
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 shadow-sm"
          >
            ➕ Add Income
          </button>
          <button
            onClick={() => openAddModal('expense')}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 shadow-sm"
          >
            ➕ Add Expense
          </button>
        </div>

        {/* Quick add category */}
        <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200">
          <div className="text-xs font-semibold text-gray-700 mb-2">Add category</div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Name (e.g. Utilities)"
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            />
            <input
              type="text"
              value={newCatCode}
              onChange={(e) => setNewCatCode(e.target.value)}
              placeholder="Code (optional)"
              className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
            />
            <select
              value={newCatType}
              onChange={(e) => setNewCatType(e.target.value as 'income' | 'expense')}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <button
              type="button"
              onClick={() => void handleAddCategory()}
              className="px-3 py-1 bg-slate-700 text-white rounded text-sm font-semibold hover:bg-slate-800"
            >
              Add
            </button>
          </div>
        </div>

        {/* Entries list */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-800">
              Entries for {(() => {
              const [y, m] = month.split('-').map(Number)
              return new Date(y, (m || 1) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
            })()}
            </h2>
          </div>
          {entries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No entries yet. Click &quot;Add Income&quot; or &quot;Add Expense&quot; to start.
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Description</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Category</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">How paid</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-700 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const type = inferType(entry)
                  const alloc = entry.allocations[0]
                  const catName = alloc?.category.name ?? '—'
                  const amount = inferAmount(entry)
                  const payment = type === 'expense' ? formatPaymentLabel(inferPaymentMethod(entry)) : '—'
                  return (
                    <tr key={entry.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">{entry.date}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {type === 'income' ? 'Income' : 'Expense'}
                        </span>
                      </td>
                      <td className="px-3 py-2">{entry.description}</td>
                      <td className="px-3 py-2">{catName}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {type === 'income' ? '+' : '-'}${formatCurrency(amount)}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{payment}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => openEditModal(entry)}
                          className="text-blue-600 hover:underline text-xs font-medium mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void deleteEntry(entry.id)}
                          className="text-red-600 hover:underline text-xs font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Edit' : 'Add'} {modalOpen === 'income' ? 'Income' : 'Expense'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Electric bill, Fuel sales"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => {
                    const newCategoryId = e.target.value
                    const updates: Partial<EntryForm> = { categoryId: newCategoryId }
                    if (
                      modalOpen === 'expense' &&
                      newCategoryId &&
                      isBankChargesCategory(newCategoryId, expenseCategories)
                    ) {
                      updates.description = 'Debit and Credit card charges'
                      updates.paymentMethod = 'direct_debit'
                    }
                    setForm((f) => ({ ...f, ...updates }))
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  <option value="">Select…</option>
                  {(modalOpen === 'income' ? incomeCategories : expenseCategories).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code ? `${c.name} (${c.code})` : c.name}
                    </option>
                  ))}
                </select>
                {(modalOpen === 'income' ? incomeCategories : expenseCategories).length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">Add an {modalOpen} category below first.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount || ''}
                  onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              {modalOpen === 'expense' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">How paid</label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  >
                    {PAYMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ref (optional)</label>
                <input
                  type="text"
                  value={form.ref}
                  onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))}
                  placeholder="Cheque #, reference"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveEntry()}
                disabled={saving}
                className={`px-4 py-2 rounded font-medium text-white ${
                  modalOpen === 'income' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-60`}
              >
                {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
