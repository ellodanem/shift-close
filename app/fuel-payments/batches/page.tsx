'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/fuelPayments'
import { formatAmount } from '@/lib/fuelPayments'

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
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading batches...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Payment Batches</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage fuel payment batches and invoices
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/fuel-payments/invoices')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
            >
              ← Back to Invoices
            </button>
          </div>
        </div>

        {/* Filters + search + summary */}
        <div className="mb-6 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
              setActiveFilter('all')
              setShowCustomPicker(false)
            }}
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
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
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
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
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
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
            className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
              activeFilter === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            >
              Custom Range
            </button>

            {showCustomPicker && activeFilter === 'custom' && (
              <div className="flex gap-2 items-center ml-4">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="Start date"
              />
              <span className="text-gray-600">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="End date"
              />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                Search (Bank Ref, Category, Count)
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="bg-white rounded-lg shadow overflow-hidden">
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
                      {formatDate(new Date(batch.paymentDate))}
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
                            const summary = `Fuel Payment Batch\n\nDate: ${formatDate(
                              new Date(batch.paymentDate)
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
        )}
      </div>
    </div>
  )
}

