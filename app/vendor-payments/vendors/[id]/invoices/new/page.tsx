'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Vendor {
  id: string
  name: string
}

export default function NewVendorInvoicePage() {
  const router = useRouter()
  const params = useParams()
  const vendorId = params.id as string

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    amount: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    vat: '',
    notes: ''
  })

  useEffect(() => {
    fetch(`/api/vendor-payments/vendors/${vendorId}`)
      .then((res) => res.json())
      .then((data) => setVendor(data))
      .catch(() => setVendor(null))
  }, [vendorId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload: Record<string, unknown> = {
        invoiceNumber: formData.invoiceNumber,
        amount: parseFloat(formData.amount),
        invoiceDate: formData.invoiceDate,
        notes: formData.notes
      }
      if (formData.dueDate) payload.dueDate = formData.dueDate
      if (formData.vat !== '') payload.vat = parseFloat(formData.vat)

      const res = await fetch(`/api/vendor-payments/vendors/${vendorId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        router.push(`/vendor-payments/vendors/${vendorId}`)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to create invoice')
        setLoading(false)
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      alert('Failed to create invoice')
      setLoading(false)
    }
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Add Invoice</h1>
          <p className="text-sm text-gray-600 mt-1">
            Add a new pending invoice for {vendor.name}. If no due date is provided, it will be set to 5 days after invoice date.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
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
                placeholder="e.g., INV-001"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  VAT / Prepaid Tax
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.vat}
                  onChange={(e) => setFormData({ ...formData, vat: e.target.value })}
                  placeholder="0"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave empty to auto-set to 5 days after invoice date.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional notes..."
              />
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Invoice'}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/vendor-payments/vendors/${vendorId}`)}
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
