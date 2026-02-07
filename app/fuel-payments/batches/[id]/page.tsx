'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { formatDate, formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate, invoiceDateToInputValue } from '@/lib/invoiceHelpers'

interface PaymentBatch {
  id: string
  paymentDate: string
  bankRef: string
  totalAmount: number
  invoices: PaidInvoice[]
}

interface PaidInvoice {
  id: string
  invoiceNumber: string
  amount: number
  type: string
  invoiceDate: string
  dueDate: string
  notes: string
}

export default function BatchDetailPage() {
  const router = useRouter()
  const params = useParams()
  const batchId = params.id as string

  const [batch, setBatch] = useState<PaymentBatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddInvoice, setShowAddInvoice] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<PaidInvoice | null>(null)

  useEffect(() => {
    fetchBatch()
  }, [batchId])

  const fetchBatch = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/fuel-payments/batches/${batchId}`)
      if (res.ok) {
        const data = await res.json()
        setBatch(data)
      } else {
        alert('Failed to load batch')
        router.push('/fuel-payments/batches')
      }
    } catch (error) {
      console.error('Error fetching batch:', error)
      alert('Failed to load batch')
      router.push('/fuel-payments/batches')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteInvoice = async (invoiceId: string, invoiceNumber: string) => {
    const confirmed = window.confirm(
      `Delete invoice "${invoiceNumber}"?\n\nThis cannot be undone.`
    )
    if (!confirmed) return

    try {
      const res = await fetch(`/api/fuel-payments/invoices/${invoiceId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        fetchBatch()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to delete invoice')
      }
    } catch (error) {
      console.error('Error deleting invoice:', error)
      alert('Failed to delete invoice')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading batch...</p>
      </div>
    )
  }

  if (!batch) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Payment Batch</h1>
            <p className="text-sm text-gray-600 mt-1">
              {formatDate(new Date(batch.paymentDate))} • Bank Ref: {batch.bankRef || '(No Ref)'}
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/fuel-payments/batches')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
            >
              ← Back to Batches
            </button>
          </div>
        </div>

        {/* Batch Info Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
            <strong>Note:</strong> Payment batches are read-only. To change a payment, use the{' '}
            <strong>Revert Payment</strong> feature on the Invoices screen, then mark the invoices
            as paid again with the correct details.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Payment Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatDate(new Date(batch.paymentDate))}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Bank Reference</p>
              <p className="text-lg font-semibold text-gray-900 font-mono">
                {batch.bankRef || '(No Ref)'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Invoices</p>
              <p className="text-lg font-semibold text-gray-900">
                {batch.invoices.length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatAmount(batch.totalAmount)}
              </p>
            </div>
          </div>
        </div>

        {/* Invoices Section (read-only) */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Invoices</h2>
          </div>

          {batch.invoices.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              <p className="mb-4">No invoices in this batch.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {/* read-only */}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {batch.invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {formatAmount(invoice.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {invoice.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatInvoiceDate(invoice.invoiceDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatInvoiceDate(invoice.dueDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-400">
                        {/* read-only – changes should be made via invoices / revert flow */}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-right text-sm font-medium text-gray-700">
                      Total:
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                      {formatAmount(batch.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Add/Edit Invoice Modal intentionally disabled: batches are read-only */}
      </div>
    </div>
  )
}

// Invoice Modal Component
function InvoiceModal({
  batchId,
  invoice,
  onClose,
  onSave
}: {
  batchId: string
  invoice: PaidInvoice | null
  onClose: () => void
  onSave: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    invoiceNumber: invoice?.invoiceNumber || '',
    amount: invoice?.amount || 0,
    type: invoice?.type || 'fuel',
    invoiceDate: invoice?.invoiceDate ? invoiceDateToInputValue(invoice.invoiceDate) : invoiceDateToInputValue(new Date()),
    dueDate: invoice?.dueDate ? invoiceDateToInputValue(invoice.dueDate) : invoiceDateToInputValue(new Date()),
    notes: invoice?.notes || ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = invoice
        ? `/api/fuel-payments/invoices/${invoice.id}`
        : `/api/fuel-payments/batches/${batchId}/invoices`
      
      const method = invoice ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (res.ok) {
        onSave()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Failed to ${invoice ? 'update' : 'create'} invoice`)
        setLoading(false)
      }
    } catch (error) {
      console.error(`Error ${invoice ? 'updating' : 'creating'} invoice:`, error)
      alert(`Failed to ${invoice ? 'update' : 'create'} invoice`)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {invoice ? 'Edit Invoice' : 'Add Invoice'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="e.g., INV123456"
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
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
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
                  <option value="fuel">Fuel</option>
                  <option value="service">Service</option>
                  <option value="other">Other</option>
                </select>
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
                  Due Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : invoice ? 'Update Invoice' : 'Create Invoice'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

