'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'
import {
  type MonthFilterType,
  matchesMonthFilter,
  monthFilterLabel,
  sortChecksCurrentMonthFirst
} from '@/lib/monthFilter'

interface CheckRow {
  id: string
  source: 'vendor' | 'cashbook'
  vendorId: string | null
  paymentDate: string
  payee: string
  bankRef: string
  totalAmount: number
  clearedAt?: string
}

type TabType = 'uncashed' | 'cleared'

function formatDate(d: string) {
  return formatInvoiceDate(d)
}

function sourceLabel(source: CheckRow['source']) {
  return source === 'vendor' ? 'Vendor payment' : 'Cashbook'
}

function normalizeChecks(data: unknown, includeCleared: boolean): CheckRow[] {
  if (!Array.isArray(data)) return []

  return data.map((raw) => {
    const item = raw as Record<string, unknown>
    const vendor = item.vendor as { id?: string; name?: string } | undefined
    const rawId = String(item.id ?? '')
    const source =
      item.source === 'cashbook' || item.source === 'vendor'
        ? item.source
        : vendor
          ? 'vendor'
          : 'cashbook'

    let id = rawId
    if (rawId && !rawId.includes(':')) {
      id = `${source}:${rawId}`
    }

    const row: CheckRow = {
      id,
      source,
      vendorId:
        typeof item.vendorId === 'string'
          ? item.vendorId
          : vendor?.id ?? null,
      paymentDate: String(item.paymentDate ?? item.date ?? ''),
      payee: String(item.payee ?? vendor?.name ?? item.description ?? '—'),
      bankRef: String(item.bankRef ?? item.ref ?? '—'),
      totalAmount: Number(item.totalAmount ?? item.debitCheck ?? 0)
    }

    if (includeCleared && item.clearedAt) {
      row.clearedAt = String(item.clearedAt)
    }

    return row
  })
}

function rowKey(check: CheckRow) {
  return `${check.id}|${check.bankRef}|${check.paymentDate}`
}

function filterButtonClass(active: boolean) {
  return `px-4 py-2 rounded font-semibold text-sm transition-colors ${
    active
      ? 'bg-blue-600 text-white'
      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
  }`
}

function tabButtonClass(active: boolean) {
  return `px-4 py-2 font-semibold text-sm transition-colors border-b-2 ${
    active
      ? 'border-blue-600 text-blue-600'
      : 'border-transparent text-gray-600 hover:text-gray-900'
  }`
}

export default function CheckManagementPage() {
  const router = useRouter()
  const [uncashedChecks, setUncashedChecks] = useState<CheckRow[]>([])
  const [clearedChecks, setClearedChecks] = useState<CheckRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('uncashed')
  const [monthFilter, setMonthFilter] = useState<MonthFilterType>('all')
  const [customMonth, setCustomMonth] = useState('')
  const [clearingId, setClearingId] = useState<string | null>(null)

  const fetchChecks = async () => {
    setLoading(true)
    try {
      const [uncashedRes, clearedRes] = await Promise.all([
        fetch('/api/vendor-payments/uncashed-checks', { cache: 'no-store' }),
        fetch('/api/vendor-payments/cleared-checks', { cache: 'no-store' })
      ])

      if (uncashedRes.ok) {
        const data = await uncashedRes.json()
        setUncashedChecks(normalizeChecks(data, false))
      }
      if (clearedRes.ok) {
        const data = await clearedRes.json()
        setClearedChecks(normalizeChecks(data, true))
      }
    } catch (error) {
      console.error('Error fetching checks:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChecks()
  }, [])

  const activeChecks = activeTab === 'uncashed' ? uncashedChecks : clearedChecks

  const filteredChecks = useMemo(() => {
    const matched = activeChecks.filter((check) =>
      matchesMonthFilter(check.paymentDate, monthFilter, customMonth)
    )

    if (monthFilter === 'all') {
      return sortChecksCurrentMonthFirst(matched)
    }

    return [...matched].sort((a, b) => {
      const dateCmp = b.paymentDate.localeCompare(a.paymentDate)
      if (dateCmp !== 0) return dateCmp
      return a.bankRef.localeCompare(b.bankRef)
    })
  }, [activeChecks, monthFilter, customMonth])

  const totalAmount = useMemo(
    () => filteredChecks.reduce((sum, check) => sum + check.totalAmount, 0),
    [filteredChecks]
  )

  const monthLabel = monthFilterLabel(monthFilter, customMonth)

  const handleMarkCleared = async (id: string) => {
    if (
      !confirm(
        'Mark this check as cleared? This will deduct the amount from available funds.'
      )
    ) {
      return
    }

    setClearingId(id)
    try {
      const res = await fetch(
        `/api/vendor-payments/uncashed-checks/${encodeURIComponent(id)}/clear`,
        { method: 'PATCH' }
      )
      if (res.ok) {
        fetchChecks()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to clear check')
      }
    } catch (error) {
      console.error('Error clearing check:', error)
      alert('Failed to clear check')
    } finally {
      setClearingId(null)
    }
  }

  const summaryText = useMemo(() => {
    const isUncashed = activeTab === 'uncashed'
    const filteredCount = filteredChecks.length
    const totalCount = activeChecks.length

    if (totalCount === 0) {
      return isUncashed
        ? 'All outstanding checks — vendor payments and cashbook expenses — until cleared at the bank'
        : 'Checks cleared at the bank — vendor payments and cashbook expenses'
    }

    const scope =
      monthLabel && filteredCount !== totalCount
        ? `${filteredCount} of ${totalCount} check${totalCount === 1 ? '' : 's'} in ${monthLabel}`
        : `${filteredCount} check${filteredCount === 1 ? '' : 's'}`

    if (isUncashed) {
      return `${scope} outstanding totaling ${formatAmount(totalAmount)}`
    }

    return `${scope} cleared totaling ${formatAmount(totalAmount)}`
  }, [activeTab, activeChecks.length, filteredChecks.length, monthLabel, totalAmount])

  const emptyMessage =
    activeTab === 'uncashed' ? 'No uncashed checks.' : 'No cleared checks.'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading checks...</p>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gray-50 p-8 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Check Management</h1>
            <p className="text-sm text-gray-600 mt-1">{summaryText}</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/vendor-payments/vendors')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              ← Vendors
            </button>
            <button
              onClick={() => router.push('/vendor-payments/make-payment')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Make Payment
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Payment month
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMonthFilter('all')
                setCustomMonth('')
              }}
              className={filterButtonClass(monthFilter === 'all')}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                setMonthFilter('thisMonth')
                setCustomMonth('')
              }}
              className={filterButtonClass(monthFilter === 'thisMonth')}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => {
                setMonthFilter('lastMonth')
                setCustomMonth('')
              }}
              className={filterButtonClass(monthFilter === 'lastMonth')}
            >
              Previous Month
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMonthFilter('custom')}
                className={filterButtonClass(monthFilter === 'custom')}
              >
                Custom
              </button>
              {monthFilter === 'custom' && (
                <input
                  type="month"
                  value={customMonth}
                  onChange={(e) => setCustomMonth(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          </div>
        </div>

        <div className="mb-6 flex gap-2 border-b border-gray-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('uncashed')}
            className={tabButtonClass(activeTab === 'uncashed')}
          >
            Uncashed Checks ({uncashedChecks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cleared')}
            className={tabButtonClass(activeTab === 'cleared')}
          >
            Checks ({clearedChecks.length})
          </button>
        </div>

        {filteredChecks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500 mb-4">{emptyMessage}</p>
            {activeTab === 'uncashed' && (
              <button
                onClick={() => router.push('/vendor-payments/make-payment')}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                Make Payment
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Payee / Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Check #
                  </th>
                  {activeTab === 'cleared' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cleared
                    </th>
                  )}
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Amount
                  </th>
                  {activeTab === 'uncashed' && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredChecks.map((check) => (
                  <tr key={rowKey(check)} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(check.paymentDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {sourceLabel(check.source)}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate"
                      title={check.payee}
                    >
                      {check.payee}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">
                      {check.bankRef}
                    </td>
                    {activeTab === 'cleared' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {check.clearedAt ? formatDate(check.clearedAt) : '—'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right text-gray-900">
                      {formatAmount(check.totalAmount)}
                    </td>
                    {activeTab === 'uncashed' && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleMarkCleared(check.id)}
                          disabled={clearingId === check.id}
                          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          {clearingId === check.id ? 'Clearing...' : 'Mark as cleared'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td
                    colSpan={activeTab === 'cleared' ? 5 : 4}
                    className="px-6 py-3 text-sm font-medium text-gray-700"
                  >
                    {filteredChecks.length} check{filteredChecks.length === 1 ? '' : 's'}
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                    {formatAmount(totalAmount)}
                  </td>
                  {activeTab === 'uncashed' && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
