'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

interface VendorBatch {
  id: string
  vendorId: string
  vendorName: string
  paymentDate: string
  paymentMethod: string
  bankRef: string
  totalAmount: number
  clearedAt: string | null
  invoiceCount: number
}

type FilterType = 'all' | 'thisMonth' | 'lastMonth' | 'custom'

function formatMethod(method: string): string {
  const m = method.trim().toLowerCase()
  if (m === 'eft') return 'EFT'
  if (m === 'check' || m === 'cheque') return 'Check'
  return method
}

export default function VendorBatchesPage() {
  const router = useRouter()
  const [batches, setBatches] = useState<VendorBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    void fetchBatches()
  }, [activeFilter, customStartDate, customEndDate])

  const fetchBatches = async () => {
    setLoading(true)
    try {
      let url = '/api/vendor-payments/batches?'

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
        setBatches(await res.json())
      } else {
        console.error('Failed to fetch vendor batches')
      }
    } catch (error) {
      console.error('Error fetching vendor batches:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredBatches = batches.filter((batch) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    const vendorMatch = batch.vendorName.toLowerCase().includes(q)
    const bankMatch = (batch.bankRef || '').toLowerCase().includes(q)
    const methodMatch = formatMethod(batch.paymentMethod).toLowerCase().includes(q)
    const status = batch.clearedAt ? 'cashed' : 'uncashed'
    const statusMatch = status.includes(q)
    const countMatch = String(batch.invoiceCount).includes(q)
    return vendorMatch || bankMatch || methodMatch || statusMatch || countMatch
  })

  const totalAcrossFiltered = filteredBatches.reduce(
    (sum, batch) => sum + (batch.totalAmount || 0),
    0
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading batches…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Payment Batches</h1>
          <p className="mt-1 text-sm text-gray-600">
            All vendor payment batches across suppliers
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {(
              [
                ['all', 'All Batches'],
                ['thisMonth', 'This Month'],
                ['lastMonth', 'Last Month'],
                ['custom', 'Custom Range']
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveFilter(key)
                  setShowCustomPicker(key === 'custom')
                }}
                className={`min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
                  activeFilter === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {showCustomPicker && activeFilter === 'custom' && (
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0"
              />
              <span className="hidden text-gray-600 sm:inline">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0"
              />
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="w-full sm:w-auto">
              <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                Search (Vendor, Ref, Method, Status)
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:w-64 sm:py-1.5"
                placeholder="e.g. Barbay or check"
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

        {filteredBatches.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-600">
              No payment batches found for the selected filters. Batches are created when you
              make a vendor payment.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{batch.vendorName}</div>
                      <div className="mt-0.5 text-xs text-gray-600">
                        {formatInvoiceDate(batch.paymentDate)} ·{' '}
                        {formatMethod(batch.paymentMethod)}
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
                    {batch.invoiceCount} invoice{batch.invoiceCount !== 1 ? 's' : ''}
                    {' · '}
                    {batch.clearedAt ? (
                      <span className="text-green-700">Cashed</span>
                    ) : batch.paymentMethod.toLowerCase() === 'check' ? (
                      <span className="text-amber-700">Uncashed</span>
                    ) : (
                      <span>EFT</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 border-t border-gray-100 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/vendor-payments/vendors/${batch.vendorId}`)
                      }
                      className="min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-900"
                    >
                      Vendor
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/vendor-payments/make-payment/share/${batch.id}`)
                      }
                      className="min-h-[44px] text-sm font-medium text-green-600 hover:text-green-900"
                    >
                      Share
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-lg bg-white shadow md:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Vendor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Method
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Bank Ref
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Invoices
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredBatches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                        {formatInvoiceDate(batch.paymentDate)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {batch.vendorName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {formatMethod(batch.paymentMethod)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-900">
                        {batch.bankRef || '(No Ref)'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {batch.invoiceCount}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        {batch.clearedAt ? (
                          <span className="font-medium text-green-700">Cashed</span>
                        ) : batch.paymentMethod.toLowerCase() === 'check' ? (
                          <span className="font-medium text-amber-700">Uncashed</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-gray-900">
                        {formatAmount(batch.totalAmount)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/vendor-payments/vendors/${batch.vendorId}`)
                            }
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Vendor
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/vendor-payments/make-payment/share/${batch.id}`
                              )
                            }
                            className="text-green-600 hover:text-green-900"
                          >
                            Share
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
