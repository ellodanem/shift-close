'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { formatInvoiceDate, invoiceDateToInputValue } from '@/lib/invoiceHelpers'

interface Invoice {
  id: string
  invoiceNumber: string
  amount: number
  type: string
  invoiceDate: string
  dueDate: string
  status: string
  notes: string | null
}

export default function EditInvoicePage() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    amount: '',
    type: 'Fuel',
    invoiceDate: '',
    notes: ''
  })

  useEffect(() => {
    fetchInvoice()
  }, [invoiceId])

  const fetchInvoice = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/fuel-payments/invoices/${invoiceId}`)
      if (res.ok) {
        const data = await res.json()
        setInvoice(data)

        if (data.status !== 'pending') {
          alert('Only pending invoices can be edited')
          router.push('/fuel-payments/invoices')
          return
        }

        setFormData({
          invoiceNumber: data.invoiceNumber,
          amount: data.amount.toString(),
          type: data.type,
          invoiceDate: invoiceDateToInputValue(data.invoiceDate),
          notes: data.notes || ''
        })
      } else {
        alert('Failed to load invoice')
        router.push('/fuel-payments/invoices')
      }
    } catch (error) {
      console.error('Error fetching invoice:', error)
      alert('Failed to load invoice')
      router.push('/fuel-payments/invoices')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const res = await fetch(`/api/fuel-payments/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: formData.invoiceNumber,
          amount: parseFloat(formData.amount),
          type: formData.type,
          invoiceDate: formData.invoiceDate,
          notes: formData.notes,
          reason: 'Invoice edited',
          changedBy: 'admin'
        })
      })

      if (res.ok) {
        router.push('/fuel-payments/invoices')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to update invoice')
        setSaving(false)
      }
    } catch (error) {
      console.error('Error updating invoice:', error)
      alert('Failed to update invoice')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading invoice...</p>
      </div>
    )
  }

  if (!invoice) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Edit Invoice</h1>
          <p className="mt-1 text-sm text-gray-600">
            Update invoice details. Changes will be logged in the audit trail.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Current due date: {formatInvoiceDate(invoice.dueDate)} (will be recalculated if
            invoice date changes)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow sm:p-6">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
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
                  className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                >
                  <option value="Fuel">Fuel</option>
                  <option value="LPG">LPG</option>
                  <option value="Lubricants">Lubricants</option>
                  <option value="Rent">Rent</option>
                  <option value="Uniforms">Uniforms</option>
                  <option value="Loyalty">Loyalty</option>
                  <option value="Balance Payment">Balance Payment</option>
                </select>
              </div>
            </div>

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
              <p className="mt-1 text-xs text-gray-500">
                Due date will be recalculated to 5 days after this date.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional notes..."
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
              onClick={() => router.back()}
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
