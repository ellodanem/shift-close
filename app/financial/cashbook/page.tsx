'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

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
  debitEcard: number
  debitDcard: number
  creditAmt: number
  bank: string | null
  allocations: CashbookApiAllocation[]
}

interface CashbookRow {
  id?: string
  date: string
  ref: string
  description: string
  debitCash: number
  debitEcard: number
  debitDcard: number
  creditAmt: number
  bank: string
  categoryId: string
  amount: number
  isNew?: boolean
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
  const date = new Date(y, m, 0) // day 0 of next month = last day of target
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

export default function CashbookPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<CashbookCategory[]>([])
  const [rows, setRows] = useState<CashbookRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingRowId, setSavingRowId] = useState<string | 'new' | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [newCatCode, setNewCatCode] = useState('')
  const [month, setMonth] = useState<string>(() => formatMonthInput(new Date()))

  const dateRange = useMemo(
    () => ({
      startDate: firstOfMonth(month),
      endDate: lastOfMonth(month)
    }),
    [month]
  )

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [catRes, entryRes] = await Promise.all([
          fetch('/api/financial/cashbook/categories'),
          fetch(
            `/api/financial/cashbook/entries?startDate=${encodeURIComponent(
              dateRange.startDate
            )}&endDate=${encodeURIComponent(dateRange.endDate)}`
          )
        ])

        if (!catRes.ok) {
          throw new Error('Failed to load cashbook categories')
        }
        if (!entryRes.ok) {
          throw new Error('Failed to load cashbook entries')
        }

        const catData: CashbookCategory[] = await catRes.json()
        setCategories(catData)

        const entryData: CashbookApiEntry[] = await entryRes.json()
        const mapped: CashbookRow[] = entryData.map((e) => {
          const firstAlloc = e.allocations[0]
          return {
            id: e.id,
            date: e.date,
            ref: e.ref || '',
            description: e.description || '',
            debitCash: e.debitCash ?? 0,
            debitEcard: e.debitEcard ?? 0,
            debitDcard: e.debitDcard ?? 0,
            creditAmt: e.creditAmt ?? 0,
            bank: e.bank || '',
            categoryId: firstAlloc?.category.id ?? '',
            amount: firstAlloc?.amount ?? 0
          }
        })
        setRows(mapped)
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to load cashbook data')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [dateRange.startDate, dateRange.endDate])

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: undefined,
        isNew: true,
        date: dateRange.startDate,
        ref: '',
        description: '',
        debitCash: 0,
        debitEcard: 0,
        debitDcard: 0,
        creditAmt: 0,
        bank: '',
        categoryId: categories[0]?.id ?? '',
        amount: 0
      }
    ])
  }

  const updateRowField = (index: number, field: keyof CashbookRow, value: any) => {
    setRows((prev) => {
      const copy = [...prev]
      const row = { ...copy[index], [field]: value }
      copy[index] = row
      return copy
    })
  }

  const saveRow = async (index: number) => {
    const row = rows[index]
    if (!row) return

    // Basic validation
    if (!row.date || !row.description || !row.categoryId) {
      alert('Date, Description and Category are required.')
      return
    }

    const payload = {
      date: row.date,
      ref: row.ref || null,
      description: row.description,
      debitCash: Number(row.debitCash) || 0,
      debitEcard: Number(row.debitEcard) || 0,
      debitDcard: Number(row.debitDcard) || 0,
      creditAmt: Number(row.creditAmt) || 0,
      bank: row.bank || null,
      categoryId: row.categoryId,
      amount: Number(row.amount) || 0
    }

    try {
      setSavingRowId(row.id ?? 'new')
      let saved: CashbookApiEntry
      if (!row.id || row.isNew) {
        const res = await fetch('/api/financial/cashbook/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error('Failed to create entry')
        saved = await res.json()
      } else {
        const res = await fetch(`/api/financial/cashbook/entries/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error('Failed to update entry')
        saved = await res.json()
      }

      const firstAlloc = saved.allocations[0]
      setRows((prev) => {
        const copy = [...prev]
        copy[index] = {
          id: saved.id,
          date: saved.date,
          ref: saved.ref || '',
          description: saved.description || '',
          debitCash: saved.debitCash ?? 0,
          debitEcard: saved.debitEcard ?? 0,
          debitDcard: saved.debitDcard ?? 0,
          creditAmt: saved.creditAmt ?? 0,
          bank: saved.bank || '',
          categoryId: firstAlloc?.category.id ?? '',
          amount: firstAlloc?.amount ?? 0
        }
        return copy
      })
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to save entry')
    } finally {
      setSavingRowId(null)
    }
  }

  const deleteRow = async (index: number) => {
    const row = rows[index]
    if (!row) return

    if (row.id) {
      const confirmed = window.confirm('Delete this entry? This cannot be undone.')
      if (!confirmed) return
      try {
        const res = await fetch(`/api/financial/cashbook/entries/${row.id}`, {
          method: 'DELETE'
        })
        if (!res.ok) throw new Error('Failed to delete entry')
      } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : 'Failed to delete entry')
        return
      }
    }

    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.code ? `${c.name} (${c.code})` : c.name })),
    [categories]
  )

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
          code: newCatCode.trim() || null
        })
      })
      if (!res.ok) throw new Error('Failed to create category')
      const created: CashbookCategory = await res.json()
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCatName('')
      setNewCatCode('')
    } catch (err) {
      console.error(err)
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
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cashbook</h1>
            <p className="text-sm text-gray-600 mt-1">
              Simple cashbook grid mirroring your accountant&apos;s sheet (one category per line).
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 font-medium">Month:</span>
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

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1">Quick add category</div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Name (e.g. Rec. Gen)"
                className="border border-gray-300 rounded px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={newCatCode}
                onChange={(e) => setNewCatCode(e.target.value)}
                placeholder="Code (e.g. 8021)"
                className="border border-gray-300 rounded px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => void handleAddCategory()}
                className="px-3 py-1 bg-slate-700 text-white rounded text-xs font-semibold hover:bg-slate-800"
              >
                Add Category
              </button>
            </div>
          </div>
        </div>

        <div className="mb-3 flex justify-between items-center">
          <button
            onClick={handleAddRow}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700"
          >
            + Add Row
          </button>
          <span className="text-xs text-gray-500">
            Tip: Date, Description, Category & Amount are required. One category per row.
          </span>
        </div>

        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-700">Date</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-700">Ref</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-700">Description</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-700">Debit Cash</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-700">Debit E-Card</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-700">Debit D-Card</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-700">Credit</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-700">Bank</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-700">Category</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-700">Amount</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-4 text-center text-gray-500">
                    No entries for this month yet. Click &quot;+ Add Row&quot; to start.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={row.id ?? `new-${index}`} className="border-t border-gray-100">
                    <td className="px-1 py-1">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRowField(index, 'date', e.target.value)}
                        className="w-full border border-gray-300 rounded px-1 py-0.5"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="text"
                        value={row.ref}
                        onChange={(e) => updateRowField(index, 'ref', e.target.value)}
                        className="w-full border border-gray-300 rounded px-1 py-0.5"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateRowField(index, 'description', e.target.value)}
                        className="w-full border border-gray-300 rounded px-1 py-0.5"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.debitCash}
                        onChange={(e) => updateRowField(index, 'debitCash', Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-1 py-0.5 text-right"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.debitEcard}
                        onChange={(e) => updateRowField(index, 'debitEcard', Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-1 py-0.5 text-right"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.debitDcard}
                        onChange={(e) => updateRowField(index, 'debitDcard', Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-1 py-0.5 text-right"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.creditAmt}
                        onChange={(e) => updateRowField(index, 'creditAmt', Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-1 py-0.5 text-right"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="text"
                        value={row.bank}
                        onChange={(e) => updateRowField(index, 'bank', e.target.value)}
                        className="w-full border border-gray-300 rounded px-1 py-0.5"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={row.categoryId}
                        onChange={(e) => updateRowField(index, 'categoryId', e.target.value)}
                        className="w-full border border-gray-300 rounded px-1 py-0.5"
                      >
                        <option value="">Select…</option>
                        {categoryOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) => updateRowField(index, 'amount', Number(e.target.value))}
                        className="w-full border border-gray-300 rounded px-1 py-0.5 text-right"
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => void saveRow(index)}
                          disabled={savingRowId === (row.id ?? 'new')}
                          className="px-2 py-0.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-60"
                        >
                          {savingRowId === (row.id ?? 'new') ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => void deleteRow(index)}
                          className="px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

