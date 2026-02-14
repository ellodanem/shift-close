'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatInvoiceDate, getDueDateStatus } from '@/lib/invoiceHelpers'
import { formatAmount } from '@/lib/fuelPayments'

interface Invoice {
  id: string
  invoiceNumber: string
  amount: number
  type: string
  invoiceDate: string
  dueDate: string
  status: string
}

function MakePaymentPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [bankRef, setBankRef] = useState('')
  const [addToCashbook, setAddToCashbook] = useState(true)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetchInvoices()
    
    // Check for pre-selected invoices from URL
    const selectedParam = searchParams.get('selected')
    if (selectedParam) {
      const ids = selectedParam.split(',').filter(id => id.trim())
      setSelectedInvoiceIds(new Set(ids))
    }
  }, [searchParams])

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fuel-payments/invoices?status=pending')
      if (res.ok) {
        const data = await res.json()
        setInvoices(data)
      } else {
        console.error('Failed to fetch invoices')
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoiceIds)
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId)
    } else {
      newSelected.add(invoiceId)
    }
    setSelectedInvoiceIds(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedInvoiceIds.size === invoices.length) {
      setSelectedInvoiceIds(new Set())
    } else {
      setSelectedInvoiceIds(new Set(invoices.map(inv => inv.id)))
    }
  }

  const handleMakePayment = async () => {
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }

    if (!bankRef.trim()) {
      alert('Please enter a bank reference number')
      return
    }

    const confirmed = window.confirm(
      `Mark ${selectedInvoiceIds.size} invoice${selectedInvoiceIds.size !== 1 ? 's' : ''} as paid?\n\nPayment Date: ${formatInvoiceDate(paymentDate)}\nBank Ref: ${bankRef.trim()}${addToCashbook ? '\n\nAdd to Cashbook as expense: Yes' : ''}`
    )
    if (!confirmed) return

    setProcessing(true)
    try {
      const res = await fetch('/api/fuel-payments/make-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentDate,
          bankRef: bankRef.trim(),
          selectedInvoiceIds: Array.from(selectedInvoiceIds),
          addToCashbook
        })
      })

      if (res.ok) {
        const data = await res.json()
        // Redirect to share page for this payment batch
        router.push(`/fuel-payments/make-payment/share/${data.batch.id}`)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to make payment')
        setProcessing(false)
      }
    } catch (error) {
      console.error('Error making payment:', error)
      alert('Failed to make payment')
      setProcessing(false)
    }
  }

  const selectedTotal = invoices
    .filter(inv => selectedInvoiceIds.has(inv.id))
    .reduce((sum, inv) => sum + inv.amount, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading invoices...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Mark Paid</h1>
            <p className="text-sm text-gray-600 mt-1">
              Select invoices and enter payment details to mark them as paid
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => router.push('/fuel-payments/invoices')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
            >
              ← Back to Invoices
            </button>
          </div>
        </div>

        {/* Payment Details */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bank Ref (numbers only)
              </label>
              <input
                type="text"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g., 18921926"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="addToCashbook"
                checked={addToCashbook}
                onChange={(e) => setAddToCashbook(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="addToCashbook" className="text-sm text-gray-700">
                Add to Cashbook as expense
              </label>
            </div>
          </div>
        </div>

        {/* Invoice Selection */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Pending Invoices ({invoices.length})
              </h3>
            </div>
            {invoices.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedInvoiceIds.size === invoices.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {invoices.length === 0 ? (
            <p className="text-gray-600 text-center py-8">
              No pending invoices available.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.size === invoices.length && invoices.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices.map((invoice) => {
                    const dueStatus = getDueDateStatus(invoice.dueDate)
                    return (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedInvoiceIds.has(invoice.id)}
                            onChange={() => handleToggleInvoice(invoice.id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatInvoiceDate(invoice.invoiceDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-xs font-semibold border ${dueStatus.className}`}>
                            {formatInvoiceDate(invoice.dueDate)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {formatAmount(invoice.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {invoice.type}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {selectedInvoiceIds.size > 0 && (
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-right text-sm font-medium text-gray-700">
                        Selected Total:
                      </td>
                      <td colSpan={2} className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {formatAmount(selectedTotal)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex gap-4">
            <button
              onClick={handleMakePayment}
              disabled={processing || selectedInvoiceIds.size === 0 || !bankRef.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Mark Selected Invoices Paid'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MakePaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      }
    >
      <MakePaymentPageInner />
    </Suspense>
  )
}

