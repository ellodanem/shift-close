'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  VendorInvoiceAmountFields,
  VendorInvoiceVatCalculatorHeader
} from '../../../components/VendorInvoiceAmountFields'
import { DEFAULT_VAT_RATE } from '@/lib/vendorVat'

interface VendorInvoice {
  id: string
  vendorId: string
  invoiceNumber: string
  amount: number
  invoiceDate: string
  dueDate: string | null
  vat: number | null
  status: string
  notes: string
  vatRate?: number
  vendor?: {
    name: string
    isVatRegistered: boolean
  }
}

export default function EditVendorInvoicePage() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<VendorInvoice | null>(null)
  const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    amount: '',
    invoiceDate: '',
    dueDate: '',
    vat: '',
    notes: ''
  })

  useEffect(() => {
    fetchInvoice()
  }, [invoiceId])

  const fetchInvoice = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendor-payments/invoices/${invoiceId}`)
      if (!res.ok) throw new Error('Failed to fetch invoice')
      const data: VendorInvoice = await res.json()
      setInvoice(data)
      if (typeof data.vatRate === 'number') setVatRate(data.vatRate)
      setFormData({
        invoiceNumber: data.invoiceNumber,
        amount: String(data.amount),
        invoiceDate: data.invoiceDate.slice(0, 10),
        dueDate: data.dueDate ? data.dueDate.slice(0, 10) : '',
        vat: data.vat != null ? String(data.vat) : '',
        notes: data.notes || ''
      })
    } catch (err) {
      console.error('Error fetching invoice:', err)
      setError('Failed to load invoice')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        invoiceNumber: formData.invoiceNumber,
        amount: parseFloat(formData.amount),
        invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate || null,
        notes: formData.notes
      }
      if (formData.vat !== '') payload.vat = parseFloat(formData.vat)

      const res = await fetch(`/api/vendor-payments/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to update invoice')
      }

      router.push(`/vendor-payments/vendors/${invoice?.vendorId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update invoice')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-red-600">Invoice not found.</p>
        <button
          type="button"
          onClick={() => router.push('/vendor-payments/vendors')}
          className="mt-4 min-h-[44px] text-blue-600 sm:min-h-0"
        >
          Back to Vendors
        </button>
      </div>
    )
  }

  if (invoice.status === 'paid') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-amber-600">Cannot edit a paid invoice.</p>
        <button
          type="button"
          onClick={() => router.push(`/vendor-payments/vendors/${invoice.vendorId}`)}
          className="mt-4 min-h-[44px] text-blue-600 sm:min-h-0"
        >
          Back to Vendor
        </button>
      </div>
    )
  }

  const isVatRegistered = Boolean(invoice.vendor?.isVatRegistered)

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Edit Invoice</h1>
            <p className="mt-1 text-sm text-gray-600">
              {invoice.vendor?.name} — Invoice #{invoice.invoiceNumber}
            </p>
          </div>
          <VendorInvoiceVatCalculatorHeader
            isVatRegistered={isVatRegistered}
            vatRate={vatRate}
            amount={formData.amount}
            vat={formData.vat}
            onAmountVatChange={(amount, vat) =>
              setFormData((prev) => ({ ...prev, amount, vat }))
            }
          />
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow sm:p-6">
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Invoice Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Invoice Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.invoiceDate}
                  onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                  className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:gap-4">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:min-h-0"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/vendor-payments/vendors/${invoice.vendorId}`)}
              className="min-h-[44px] rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 sm:min-h-0"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
