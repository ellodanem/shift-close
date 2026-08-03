'use client'

import { FormEvent, useEffect, useState } from 'react'
import { DEFAULT_VAT_RATE } from '@/lib/vendorVat'
import {
  VendorInvoiceAmountFields,
  VendorInvoiceVatCalculatorHeader
} from './VendorInvoiceAmountFields'

export interface VendorQuickEditInvoice {
  id: string
  invoiceNumber: string
  amount: number
  invoiceDate: string
  dueDate: string | null
  vat: number | null
  notes?: string | null
}

export function VendorQuickEditInvoiceModal({
  open,
  invoice,
  isVatRegistered,
  onClose,
  onSaved
}: {
  open: boolean
  invoice: VendorQuickEditInvoice | null
  isVatRegistered: boolean
  onClose: () => void
  onSaved: (updated: VendorQuickEditInvoice) => void
}) {
  const [saving, setSaving] = useState(false)
  const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    amount: '',
    invoiceDate: '',
    dueDate: '',
    vat: '',
    notes: ''
  })

  useEffect(() => {
    if (!open || !invoice) return
    setSaving(false)
    setFormData({
      invoiceNumber: invoice.invoiceNumber,
      amount: String(invoice.amount),
      invoiceDate: invoice.invoiceDate.slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
      vat: invoice.vat != null ? String(invoice.vat) : '',
      notes: invoice.notes || ''
    })

    let cancelled = false
    setLoadingDetails(true)
    void (async () => {
      try {
        const res = await fetch(`/api/vendor-payments/invoices/${invoice.id}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (typeof data.vatRate === 'number') setVatRate(data.vatRate)
        if (data.notes != null) {
          setFormData((prev) => ({ ...prev, notes: data.notes || '' }))
        }
      } catch (error) {
        console.error('Error loading invoice details:', error)
      } finally {
        if (!cancelled) setLoadingDetails(false)
      }
    })()

    return () => {
      cancelled = true
    }
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
      const payload: Record<string, unknown> = {
        invoiceNumber: formData.invoiceNumber.trim(),
        amount,
        invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate || null,
        notes: formData.notes
      }
      if (formData.vat !== '') payload.vat = parseFloat(formData.vat)
      else if (!isVatRegistered) payload.vat = 0

      const res = await fetch(`/api/vendor-payments/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
        invoiceDate: updated.invoiceDate,
        dueDate: updated.dueDate,
        vat: updated.vat,
        notes: updated.notes
      })
    } catch (error) {
      console.error('Error updating vendor invoice:', error)
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
        aria-labelledby="vendor-quick-edit-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="vendor-quick-edit-title" className="text-lg font-bold text-gray-900">
              Quick edit invoice
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Fix details without leaving payment. Totals update after save.
            </p>
          </div>
          {isVatRegistered && (
            <VendorInvoiceVatCalculatorHeader
              isVatRegistered={isVatRegistered}
              vatRate={vatRate}
              amount={formData.amount}
              vat={formData.vat}
              onAmountVatChange={(amount, vat) =>
                setFormData((prev) => ({ ...prev, amount, vat }))
              }
            />
          )}
        </div>

        {loadingDetails ? (
          <p className="mt-6 text-center text-sm text-gray-600">Loading…</p>
        ) : (
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

            <VendorInvoiceAmountFields
              isVatRegistered={isVatRegistered}
              vatRate={vatRate}
              amount={formData.amount}
              vat={formData.vat}
              hideCalculator
              onAmountChange={(value) => setFormData((prev) => ({ ...prev, amount: value }))}
              onVatChange={(value) => setFormData((prev) => ({ ...prev, vat: value }))}
            />

            <div className="grid grid-cols-2 gap-3">
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
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Due date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
        )}
      </div>
    </div>
  )
}
