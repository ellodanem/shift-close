'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading batch...</p>
      </div>
    )
  }

  if (!batch) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Payment Batch</h1>
            <p className="mt-1 text-sm text-gray-600">
              {formatInvoiceDate(batch.paymentDate)} · Bank Ref:{' '}
              <span className="font-mono">{batch.bankRef || '(No Ref)'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/fuel-payments/batches')}
            className="min-h-[44px] rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600 sm:min-h-0"
          >
            ← Back to Batches
          </button>
        </div>

        {/* Batch Info Card */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            <strong>Note:</strong> Payment batches are read-only. To change a payment, use the{' '}
            <strong>Revert Payment</strong> feature on the Invoices screen, then mark the invoices
            as paid again with the correct details.
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-gray-600 sm:text-sm">Payment Date</p>
              <p className="text-base font-semibold text-gray-900 sm:text-lg">
                {formatInvoiceDate(batch.paymentDate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 sm:text-sm">Bank Reference</p>
              <p className="font-mono text-base font-semibold text-gray-900 sm:text-lg">
                {batch.bankRef || '(No Ref)'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 sm:text-sm">Total Invoices</p>
              <p className="text-base font-semibold text-gray-900 sm:text-lg">
                {batch.invoices.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 sm:text-sm">Total Amount</p>
              <p className="text-base font-semibold text-gray-900 sm:text-lg">
                {formatAmount(batch.totalAmount)}
              </p>
            </div>
          </div>
        </div>

        {/* Invoices Section (read-only) */}
        <div className="rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">Invoices</h2>
          </div>

          {batch.invoices.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              <p>No invoices in this batch.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 p-3 md:hidden">
                {batch.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="rounded-lg border border-gray-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono text-sm font-medium text-gray-900">
                        {invoice.invoiceNumber}
                      </div>
                      <span className="shrink-0 font-mono font-semibold text-gray-900">
                        {formatAmount(invoice.amount)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      {invoice.type}
                      {' · '}
                      Invoice {formatInvoiceDate(invoice.invoiceDate)}
                      {' · '}
                      Due {formatInvoiceDate(invoice.dueDate)}
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-gray-300 bg-gray-100 p-3 text-sm font-semibold">
                  <div className="flex items-center justify-between">
                    <span>Total</span>
                    <span className="font-mono">{formatAmount(batch.totalAmount)}</span>
                  </div>
                </div>
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Invoice #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Invoice Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Due Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {batch.invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-900">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                          {formatAmount(invoice.amount)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {invoice.type}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {formatInvoiceDate(invoice.invoiceDate)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {formatInvoiceDate(invoice.dueDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-4 text-right text-sm font-medium text-gray-700"
                      >
                        Total:
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-gray-900">
                        {formatAmount(batch.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

