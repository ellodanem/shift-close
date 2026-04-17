'use client'

import { useEffect, useState } from 'react'
import { formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate, getDueDateStatus } from '@/lib/invoiceHelpers'

interface Invoice {
  id: string
  invoiceNumber: string
  amount: number
  type: string
  invoiceDate: string
  dueDate: string
  status: string
}

export function FuelMakePaymentModal({
  open,
  initialSelectedCsv,
  onClose,
  onSuccess
}: {
  open: boolean
  initialSelectedCsv: string
  onClose: () => void
  onSuccess: (batchId: string) => void
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [paymentDate, setPaymentDate] = useState('')
  const [bankRef, setBankRef] = useState('')
  const [addToCashbook, setAddToCashbook] = useState(true)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fuel-payments/invoices?status=pending')
      if (res.ok) {
        const data: Invoice[] = await res.json()
        setInvoices(data)
        if (initialSelectedCsv.trim()) {
          const wanted = new Set(
            initialSelectedCsv
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
          )
          const next = new Set<string>(
            data.filter((inv) => wanted.has(inv.id)).map((inv) => inv.id)
          )
          setSelectedInvoiceIds(next)
        } else {
          setSelectedInvoiceIds(new Set())
        }
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setPaymentDate(new Date().toISOString().split('T')[0])
    setBankRef('')
    setAddToCashbook(true)
    setProcessing(false)
    void fetchInvoices()
  }, [open, initialSelectedCsv])

  const handleToggleInvoice = (invoiceId: string) => {
    const next = new Set(selectedInvoiceIds)
    if (next.has(invoiceId)) next.delete(invoiceId)
    else next.add(invoiceId)
    setSelectedInvoiceIds(next)
  }

  const handleSelectAll = () => {
    if (selectedInvoiceIds.size === invoices.length) {
      setSelectedInvoiceIds(new Set())
    } else {
      setSelectedInvoiceIds(new Set(invoices.map((inv) => inv.id)))
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
        onSuccess(data.batch.id)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to make payment')
      }
    } catch (error) {
      console.error('Error making payment:', error)
      alert('Failed to make payment')
    } finally {
      setProcessing(false)
    }
  }

  const selectedTotal = invoices
    .filter((inv) => selectedInvoiceIds.has(inv.id))
    .reduce((sum, inv) => sum + inv.amount, 0)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fuel-make-payment-title"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <h2 id="fuel-make-payment-title" className="text-2xl font-bold text-gray-900">
            Mark selected as paid
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Confirm payment details and mark pending invoices as paid.
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Payment details</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Payment date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Bank ref (numbers only)
              </label>
              <input
                type="text"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g., 18921926"
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="fuelAddToCashbook"
                checked={addToCashbook}
                onChange={(e) => setAddToCashbook(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="fuelAddToCashbook" className="text-sm text-gray-700">
                Add to Cashbook as expense
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Pending invoices ({invoices.length})
            </h3>
            {invoices.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedInvoiceIds.size === invoices.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-gray-600 py-8 text-center">Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No pending invoices available.</p>
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
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due date
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
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold border ${dueStatus.className}`}
                          >
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
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <span className="text-sm text-gray-700">
            {selectedInvoiceIds.size} selected · Total:{' '}
            <span className="font-semibold text-gray-900">{formatAmount(selectedTotal)}</span>
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleMakePayment()}
              disabled={processing || selectedInvoiceIds.size === 0 || !bankRef.trim()}
              className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Mark selected invoices paid'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
