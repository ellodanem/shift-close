'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'
import { formatAmount } from '@/lib/fuelPayments'
import {
  VendorInvoiceAmountFields,
  VendorInvoiceVatCalculatorHeader
} from './VendorInvoiceAmountFields'

interface VendorOption {
  id: string
  name: string
  isVatRegistered: boolean
}

export interface VendorAddInvoicePendingRow {
  id: string
  invoiceNumber: string
  amount: number
  invoiceDate: string
  dueDate: string | null
  vat: number | null
  notes: string
}

function vendorInvoiceTotal(amount: number, vat: number | null | undefined) {
  return amount + (vat ?? 0)
}

export interface VendorAddInvoiceModalProps {
  open: boolean
  onClose: () => void
  vendors: VendorOption[]
  vatRate: number
  initialVendorId?: string
  fixedVendorId?: string
  fixedVendorName?: string
  fixedVendorIsVatRegistered?: boolean
  onSuccess: () => void
  onEditInvoice: (invoice: VendorAddInvoicePendingRow) => void
}

export function VendorAddInvoiceModal({
  open,
  onClose,
  vendors,
  vatRate,
  initialVendorId = '',
  fixedVendorId,
  fixedVendorName,
  fixedVendorIsVatRegistered = false,
  onSuccess,
  onEditInvoice
}: VendorAddInvoiceModalProps) {
  const invoiceNumberRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingInvoices, setPendingInvoices] = useState<VendorAddInvoicePendingRow[]>([])
  const [form, setForm] = useState({
    vendorId: '',
    invoiceNumber: '',
    amount: '',
    invoiceDate: '',
    dueDate: '',
    vat: '',
    notes: ''
  })

  const activeVendorId = fixedVendorId || form.vendorId

  const selectedVendor = useMemo(() => {
    if (fixedVendorId) {
      return {
        id: fixedVendorId,
        name: fixedVendorName ?? '',
        isVatRegistered: fixedVendorIsVatRegistered
      }
    }
    return vendors.find((v) => v.id === form.vendorId) ?? null
  }, [fixedVendorId, fixedVendorName, fixedVendorIsVatRegistered, vendors, form.vendorId])

  const pendingTotal = pendingInvoices.reduce(
    (sum, inv) => sum + vendorInvoiceTotal(inv.amount, inv.vat),
    0
  )

  const resetFormFields = useCallback(
    (vendorId: string, keepDates = false) => {
      setForm((prev) => ({
        vendorId,
        invoiceNumber: '',
        amount: '',
        invoiceDate: keepDates ? prev.invoiceDate : businessTodayYmd(),
        dueDate: keepDates ? prev.dueDate : '',
        vat: '',
        notes: ''
      }))
    },
    []
  )

  const fetchPendingForVendor = useCallback(async (vendorId: string) => {
    if (!vendorId) {
      setPendingInvoices([])
      return
    }
    setPendingLoading(true)
    try {
      const res = await fetch(
        `/api/vendor-payments/invoices?status=pending&vendorId=${encodeURIComponent(vendorId)}`
      )
      if (res.ok) {
        const data = await res.json()
        setPendingInvoices(Array.isArray(data) ? data : [])
      } else {
        setPendingInvoices([])
      }
    } catch {
      setPendingInvoices([])
    } finally {
      setPendingLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const vendorId = fixedVendorId || initialVendorId || ''
    resetFormFields(vendorId)
    void fetchPendingForVendor(vendorId)
    setTimeout(() => invoiceNumberRef.current?.focus(), 50)
  }, [open, fixedVendorId, initialVendorId, resetFormFields, fetchPendingForVendor])

  useEffect(() => {
    if (!open || fixedVendorId) return
    void fetchPendingForVendor(form.vendorId)
  }, [open, fixedVendorId, form.vendorId, fetchPendingForVendor])

  const handleClose = () => {
    setSaving(false)
    onClose()
  }

  const submitInvoice = async (createAnother: boolean) => {
    if (!activeVendorId) {
      alert('Please select a vendor')
      return
    }
    const amt = parseFloat(form.amount)
    if (Number.isNaN(amt)) {
      alert('Please enter a valid amount')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        invoiceNumber: form.invoiceNumber.trim(),
        amount: amt,
        invoiceDate: form.invoiceDate,
        notes: form.notes.trim()
      }
      if (form.dueDate.trim()) payload.dueDate = form.dueDate
      if (form.vat.trim() !== '') payload.vat = parseFloat(form.vat)

      const res = await fetch(`/api/vendor-payments/vendors/${activeVendorId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        onSuccess()
        await fetchPendingForVendor(activeVendorId)
        if (createAnother) {
          resetFormFields(activeVendorId, true)
          setTimeout(() => invoiceNumberRef.current?.focus(), 50)
        } else {
          handleClose()
        }
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to create invoice')
      }
    } catch {
      alert('Failed to create invoice')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submitInvoice(false)
  }

  const handleDelete = async (invoice: VendorAddInvoicePendingRow) => {
    if (!confirm(`Delete invoice ${invoice.invoiceNumber}?`)) return
    try {
      const res = await fetch(`/api/vendor-payments/invoices/${invoice.id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        onSuccess()
        await fetchPendingForVendor(activeVendorId)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to delete invoice')
      }
    } catch {
      alert('Failed to delete invoice')
    }
  }

  if (!open) return null

  const pendingLabel = selectedVendor?.name
    ? `Pending for ${selectedVendor.name}`
    : 'Pending invoices'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-vendor-invoice-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="add-vendor-invoice-title" className="text-2xl font-bold text-gray-900">
              Add invoice
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Add a pending vendor invoice. Select a vendor to see their pending invoices below.
            </p>
          </div>
          {selectedVendor && (
            <VendorInvoiceVatCalculatorHeader
              isVatRegistered={selectedVendor.isVatRegistered}
              vatRate={vatRate}
              amount={form.amount}
              vat={form.vat}
              onAmountVatChange={(amount, vat) => setForm((prev) => ({ ...prev, amount, vat }))}
            />
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!fixedVendorId && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Vendor <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={form.vendorId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    vendorId: e.target.value,
                    amount: '',
                    vat: ''
                  })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Invoice number <span className="text-red-500">*</span>
            </label>
            <input
              ref={invoiceNumberRef}
              type="text"
              required
              value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
              placeholder="e.g., INV-001"
              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <VendorInvoiceAmountFields
            isVatRegistered={Boolean(selectedVendor?.isVatRegistered)}
            vatRate={vatRate}
            amount={form.amount}
            vat={form.vat}
            hideCalculator
            onAmountChange={(value) => setForm((prev) => ({ ...prev, amount: value }))}
            onVatChange={(value) => setForm((prev) => ({ ...prev, vat: value }))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Invoice date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.invoiceDate}
                onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Due date <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Optional notes…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create invoice'}
            </button>
            <button
              type="button"
              onClick={() => void submitInvoice(true)}
              disabled={saving}
              className="rounded bg-slate-600 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create and New…'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>

        {activeVendorId && (
          <div className="mt-6 border-t border-gray-200 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              {pendingLabel} ({pendingInvoices.length})
            </h3>
            {pendingLoading ? (
              <p className="text-sm text-gray-500">Loading pending invoices…</p>
            ) : pendingInvoices.length === 0 ? (
              <p className="text-sm text-gray-500">No pending invoices for this vendor.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">Invoice #</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium text-right">Amount</th>
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvoices.map((inv) => (
                      <tr key={inv.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-mono">{inv.invoiceNumber}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {formatInvoiceDate(inv.invoiceDate)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatAmount(vendorInvoiceTotal(inv.amount, inv.vat))}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onEditInvoice(inv)}
                            className="text-blue-600 hover:text-blue-800 text-sm mr-3"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(inv)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-gray-50">
                    <tr className="border-t border-gray-200">
                      <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-700">
                        Total ({pendingInvoices.length})
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-semibold text-blue-700">
                        {formatAmount(pendingTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
