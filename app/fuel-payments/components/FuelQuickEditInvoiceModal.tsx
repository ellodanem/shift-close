'use client'

import { FormEvent, useEffect, useState } from 'react'
import { invoiceDateToInputValue } from '@/lib/invoiceHelpers'

export interface FuelQuickEditInvoice {
  id: string
  invoiceNumber: string
  amount: number
  type: string
  invoiceDate: string
  dueDate: string
  notes?: string | null
}

const FUEL_TYPES = [
  'Fuel',
  'LPG',
  'Lubricants',
  'Rent',
  'Uniforms',
  'Loyalty',
  'Balance Payment'
] as const

export function FuelQuickEditInvoiceModal({
  open,
  invoice,
  onClose,
  onSaved
}: {
  open: boolean
  invoice: FuelQuickEditInvoice | null
  onClose: () => void
  onSaved: (updated: FuelQuickEditInvoice) => void
}) {
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    amount: '',
    type: 'Fuel',
    invoiceDate: '',
    notes: ''
  })

  useEffect(() => {
    if (!open || !invoice) return
    setSaving(false)
    setFormData({
      invoiceNumber: invoice.invoiceNumber,
      amount: String(invoice.amount),
      type: invoice.type,
      invoiceDate: invoiceDateToInputValue(invoice.invoiceDate),
      notes: invoice.notes || ''
    })
  }, [open, invoice])

  if (!open || !invoice) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(formData.amount)
    if (!formData.invoiceNumber.trim()) {
      alert('Invoice number is required')
      return
    }
    if (Number.isNaN(amount) || amount < 0) {
      alert('Enter a valid amount')
      return
    }
    if (!formData.invoiceDate) {
      alert('Invoice date is required')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/fuel-payments/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: formData.invoiceNumber.trim(),
          amount,
          type: formData.type,
          invoiceDate: formData.invoiceDate,
          notes: formData.notes,
          reason: 'Quick edit during payment',
          changedBy: 'admin'
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to update invoice')
        return
      }

      const updated = await res.json()
      onSaved({
        id: updated.id,
        invoiceNumber: updated.invoiceNumber,
        amount: updated.amount,
        type: updated.type,
        invoiceDate: updated.invoiceDate,
        dueDate: updated.dueDate,
        notes: updated.notes
      })
    } catch (error) {
      console.error('Error updating invoice:', error)
      alert('Failed to update invoice')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fuel-quick-edit-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="fuel-quick-edit-title" className="text-lg font-bold text-gray-900">
          Quick edit invoice
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Fix details without leaving payment. Totals and transfer description update after save.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Invoice number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.invoiceNumber}
              onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {FUEL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Invoice date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={formData.invoiceDate}
              onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Due date recalculates to 5 days after this date.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
