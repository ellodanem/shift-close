'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

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
          invoiceDate: new Date(data.invoiceDate).toISOString().split('T')[0],
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
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading invoice...</p>
      </div>
    )
  }

  if (!invoice) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Edit Invoice</h1>
          <p className="text-sm text-gray-600 mt-1">
            Update invoice details. Changes will be logged in the audit trail.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Current due date: {formatInvoiceDate(invoice.dueDate)} (will be recalculated if invoice date changes)
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
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Fuel">Fuel</option>
                  <option value="LPG">LPG</option>
                  <option value="Lubricants">Lubricants</option>
                  <option value="Rent">Rent</option>
                </select>
              </div>
            </div>

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
              <p className="mt-1 text-xs text-gray-500">
                Due date will be recalculated to 5 days after this date.
              </p>
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
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
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

