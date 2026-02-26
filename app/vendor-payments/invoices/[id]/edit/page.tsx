'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface VendorInvoice {
  id: string
  vendorId: string
  invoiceNumber: string
  amount: number
  invoiceDate: string
  dueDate: string
  vat: number | null
  status: string
  notes: string
  vendor?: { name: string }
}

export default function EditVendorInvoicePage() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<VendorInvoice | null>(null)
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
      setFormData({
        invoiceNumber: data.invoiceNumber,
        amount: String(data.amount),
        invoiceDate: data.invoiceDate.slice(0, 10),
        dueDate: data.dueDate.slice(0, 10),
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
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-600">Invoice not found.</p>
        <button onClick={() => router.push('/vendor-payments/vendors')} className="mt-4 text-blue-600">
          Back to Vendors
        </button>
      </div>
    )
  }

  if (invoice.status === 'paid') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-amber-600">Cannot edit a paid invoice.</p>
        <button
          onClick={() => router.push(`/vendor-payments/vendors/${invoice.vendorId}`)}
          className="mt-4 text-blue-600"
        >
          Back to Vendor
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Edit Invoice</h1>
          <p className="text-sm text-gray-600 mt-1">
            {invoice.vendor?.name} — Invoice #{invoice.invoiceNumber}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-800">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">VAT / Prepaid Tax</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.vat}
                  onChange={(e) => setFormData({ ...formData, vat: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.invoiceDate}
                  onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/vendor-payments/vendors/${invoice.vendorId}`)}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
