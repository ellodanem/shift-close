'use client'

import { FormEvent, useEffect, useState } from 'react'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { monthDateBoundsYmd, type MonthlyReportExpenseRow } from '@/lib/vendorInvoicePaymentsReport'

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'eft', label: 'EFT' },
  { value: 'direct_debit', label: 'Direct debit' },
  { value: 'debit_credit', label: 'Debit/Credit' },
  { value: 'deposit', label: 'Deposit' }
] as const

interface CashbookCategory {
  id: string
  name: string
  code: string | null
  type: string
}

function defaultDateForMonth(month: string): string {
  const today = businessTodayYmd()
  if (today.startsWith(`${month}-`)) return today
  return monthDateBoundsYmd(month).min
}

export function AddMonthlyExpenseModal({
  open,
  onClose,
  month,
  monthName,
  editing,
  onSaved
}: {
  open: boolean
  onClose: () => void
  month: string
  monthName: string
  editing: MonthlyReportExpenseRow | null
  onSaved: () => void
}) {
  const bounds = monthDateBoundsYmd(month)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [addToCashbook, setAddToCashbook] = useState(false)
  const [cashbookDate, setCashbookDate] = useState(defaultDateForMonth(month))
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [ref, setRef] = useState('')
  const [categories, setCategories] = useState<CashbookCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alreadyInCashbook = Boolean(editing?.inCashbook)
  const showCashbookFields = addToCashbook && !alreadyInCashbook

  useEffect(() => {
    if (!open) return
    setDescription(editing?.description ?? '')
    setAmount(editing ? String(editing.amount) : '')
    setAddToCashbook(false)
    setCashbookDate(defaultDateForMonth(month))
    setCategoryId('')
    setPaymentMethod(editing?.paymentMethod || 'cash')
    setRef(editing?.ref ?? '')
    setError(null)
  }, [open, editing, month])

  useEffect(() => {
    if (!open || (!showCashbookFields && alreadyInCashbook)) return
    if (!showCashbookFields) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch('/api/financial/cashbook/categories')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !Array.isArray(data)) return
        const expenseCats = (data as CashbookCategory[]).filter((c) => c.type === 'expense')
        setCategories(expenseCats)
        setCategoryId((prev) => {
          if (prev) return prev
          const recGen = expenseCats.find((c) => /^rec\.?\s*gen$/i.test(c.name.trim()))
          return recGen?.id ?? expenseCats[0]?.id ?? ''
        })
      } catch {
        // Categories stay empty; API will fall back to Rec. Gen
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [open, showCashbookFields, alreadyInCashbook])

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const desc = description.trim()
    const amt = parseFloat(amount)
    if (!desc) {
      setError('Description is required.')
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter an amount greater than 0.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        description: desc,
        amount: amt,
        paymentMethod: showCashbookFields || alreadyInCashbook ? paymentMethod : null,
        ref: (showCashbookFields || alreadyInCashbook) && ref.trim() ? ref.trim() : null
      }

      if (editing) {
        if (!alreadyInCashbook && addToCashbook) {
          payload.addToCashbook = true
          payload.cashbookDate = cashbookDate
          payload.categoryId = categoryId || null
        }
        const res = await fetch(`/api/vendor-payments/monthly-expenses/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Failed to update expense')
      } else {
        payload.month = month
        payload.addToCashbook = addToCashbook
        if (addToCashbook) {
          payload.cashbookDate = cashbookDate
          payload.categoryId = categoryId || null
        }
        const res = await fetch('/api/vendor-payments/monthly-expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Failed to add expense')
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {editing ? 'Edit additional expense' : 'Add additional expense'}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Unique to {monthName}. Does not require a vendor or check number.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Payee or what this expense is"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {alreadyInCashbook ? (
            <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2">
              This line is already in the cashbook. Changing the description or amount updates that
              entry too.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="addExpenseToCashbook"
                checked={addToCashbook}
                onChange={(e) => setAddToCashbook(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="addExpenseToCashbook" className="text-sm text-gray-700">
                Add to cashbook as an expense
              </label>
            </div>
          )}

          {showCashbookFields && (
            <div className="space-y-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={cashbookDate}
                  min={bounds.min}
                  max={bounds.max}
                  onChange={(e) => setCashbookDate(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
                >
                  {categories.length === 0 && <option value="">Rec. Gen (default)</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code ? `${c.name} (${c.code})` : c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">How paid</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
                >
                  {PAYMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ref (optional)
                </label>
                <input
                  type="text"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Check # or bank reference, if any"
                  className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : editing ? 'Update' : 'Add expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
