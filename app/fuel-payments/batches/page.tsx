'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

interface PaymentBatch {
  id: string
  paymentDate: string
  bankRef: string
  totalAmount: number
  invoices: any[]
  _count: {
    invoices: number
  }
}

type FilterType = 'all' | 'thisMonth' | 'lastMonth' | 'custom'

export default function BatchesPage() {
  const router = useRouter()
  const [batches, setBatches] = useState<PaymentBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchBatches()
  }, [activeFilter, customStartDate, customEndDate])

  const fetchBatches = async () => {
    setLoading(true)
    try {
      let url = '/api/fuel-payments/batches?'
      
      if (activeFilter === 'thisMonth') {
        const now = new Date()
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        url += `month=${month}`
      } else if (activeFilter === 'lastMonth') {
        const now = new Date()
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const month = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
        url += `month=${month}`
      } else if (activeFilter === 'custom' && customStartDate && customEndDate) {
        url += `startDate=${customStartDate}&endDate=${customEndDate}`
      }

      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setBatches(data)
      } else {
        console.error('Failed to fetch batches')
      }
    } catch (error) {
      console.error('Error fetching batches:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, bankRef: string) => {
    const confirmed = window.confirm(
      `Delete payment batch with bank reference "${bankRef}"?\n\nThis will also delete all invoices in this batch. This cannot be undone.`
    )
    if (!confirmed) return

    try {
      const res = await fetch(`/api/fuel-payments/batches/${id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        fetchBatches()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to delete batch')
      }
    } catch (error) {
      console.error('Error deleting batch:', error)
      alert('Failed to delete batch')
    }
  }

  const filteredBatches = batches.filter((batch) => {
    const q = search.trim().toLowerCase()
    if (!q) return true

    const categories = Array.from(
      new Set((batch.invoices || []).map((inv: any) => inv.type || ''))
    )
      .join(', ')
      .toLowerCase()

    const bankMatch = (batch.bankRef || '').toLowerCase().includes(q)
    const catMatch = categories.includes(q)
    const count = batch._count?.invoices ?? batch.invoices?.length ?? 0
    const countMatch = String(count).includes(q)

    return bankMatch || catMatch || countMatch
  })

  const totalAcrossFiltered = filteredBatches.reduce((sum, batch) => {
    return sum + (batch.totalAmount || 0)
  }, 0)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading batches...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Payment Batches</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage fuel payment batches and invoices
            </p>
          </div>
        </div>

        {/* Filters + search + summary */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              onClick={() => {
              setActiveFilter('all')
              setShowCustomPicker(false)
            }}
            className={`min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
              activeFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            >
              All Batches
            </button>
            <button
              onClick={() => {
              setActiveFilter('thisMonth')
              setShowCustomPicker(false)
            }}
            className={`min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
              activeFilter === 'thisMonth'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            >
              This Month
            </button>
            <button
              onClick={() => {
              setActiveFilter('lastMonth')
              setShowCustomPicker(false)
            }}
            className={`min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
              activeFilter === 'lastMonth'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            >
              Last Month
            </button>
            <button
              onClick={() => {
              setActiveFilter('custom')
              setShowCustomPicker(true)
            }}
            className={`min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
              activeFilter === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            >
              Custom Range
            </button>
          </div>

          {showCustomPicker && activeFilter === 'custom' && (
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0"
                placeholder="Start date"
              />
              <span className="hidden text-gray-600 sm:inline">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0"
                placeholder="End date"
              />
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="w-full sm:w-auto">
              <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                Search (Bank Ref, Category, Count)
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:w-56 sm:py-1.5"
                placeholder="e.g. 19397997 or LPG"
              />
            </div>
            <div className="text-xs text-gray-600">
              <div>
                <span className="font-semibold">{filteredBatches.length}</span>{' '}
                batch{filteredBatches.length !== 1 && 'es'}
              </div>
              <div>
                Total:{' '}
                <span className="font-semibold text-blue-700">
                  {formatAmount(totalAcrossFiltered)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Batches Table */}
        {filteredBatches.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">
              No payment batches found for the selected filters. Batches are
              created automatically whenever you mark invoices as paid.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredBatches.map((batch) => {
                const count = batch._count?.invoices ?? batch.invoices?.length ?? 0
                const categories = Array.from(
                  new Set((batch.invoices || []).map((inv: any) => inv.type || ''))
                ).join(', ')
                return (
                  <div
                    key={batch.id}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatInvoiceDate(batch.paymentDate)}
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-gray-600">
                          {batch.bankRef || '(No Ref)'}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono font-semibold text-gray-900">
                        {formatAmount(batch.totalAmount)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      {count} invoice{count !== 1 ? 's' : ''}
                      {categories ? ` · ${categories}` : ''}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 border-t border-gray-100 pt-3">
                      <button
                        onClick={() => router.push(`/fuel-payments/batches/${batch.id}`)}
                        className="min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-900"
                      >
                        View
                      </button>
                      <button
                        onClick={() =>
                          router.push(`/fuel-payments/make-payment/share/${batch.id}`)
                        }
                        className="min-h-[44px] text-sm font-medium text-green-600 hover:text-green-900"
                      >
                        Share
                      </button>
                      <button
                        onClick={() => {
                          const summary = `Fuel Payment Batch\n\nDate: ${formatInvoiceDate(
                            batch.paymentDate
                          )}\nBank Ref: ${
                            batch.bankRef || '(No Ref)'
                          }\nTotal Paid: ${formatAmount(
                            batch.totalAmount
                          )}\nInvoices: ${count}\nCategories: ${categories || '-'}`
                          navigator.clipboard
                            .writeText(summary)
                            .then(() => alert('Batch summary copied to clipboard'))
                            .catch(() => alert('Failed to copy summary'))
                        }}
                        className="min-h-[44px] text-sm font-medium text-gray-600 hover:text-gray-900"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden overflow-hidden rounded-lg bg-white shadow md:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bank Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoices
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Amount
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBatches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatInvoiceDate(batch.paymentDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                      {batch.bankRef || '(No Ref)'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {batch._count?.invoices || batch.invoices?.length || 0} invoice{batch._count?.invoices !== 1 ? 's' : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {formatAmount(batch.totalAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => router.push(`/fuel-payments/batches/${batch.id}`)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View
                        </button>
                        <button
                          onClick={() => router.push(`/fuel-payments/make-payment/share/${batch.id}`)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Share
                        </button>
                        <button
                          onClick={() => {
                            const count = batch._count?.invoices ?? batch.invoices?.length ?? 0
                            const categories = Array.from(
                              new Set((batch.invoices || []).map((inv: any) => inv.type || ''))
                            ).join(', ')
                            const summary = `Fuel Payment Batch\n\nDate: ${formatInvoiceDate(
                              batch.paymentDate
                            )}\nBank Ref: ${
                              batch.bankRef || '(No Ref)'
                            }\nTotal Paid: ${formatAmount(
                              batch.totalAmount
                            )}\nInvoices: ${count}\nCategories: ${categories || '-'}`
                            navigator.clipboard
                              .writeText(summary)
                              .then(() => alert('Batch summary copied to clipboard'))
                              .catch(() => alert('Failed to copy summary'))
                          }}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

