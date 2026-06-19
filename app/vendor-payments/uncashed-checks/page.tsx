'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

interface UncashedCheck {
  id: string
  source: 'vendor' | 'cashbook'
  vendorId: string | null
  paymentDate: string
  payee: string
  bankRef: string
  totalAmount: number
}

function formatDate(d: string) {
  return formatInvoiceDate(d)
}

function sourceLabel(source: UncashedCheck['source']) {
  return source === 'vendor' ? 'Vendor payment' : 'Cashbook'
}

/** Accept both unified API rows and legacy vendor-batch payloads. */
function normalizeUncashedChecks(data: unknown): UncashedCheck[] {
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

    return {
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
  })
}

function rowKey(check: UncashedCheck) {
  return `${check.id}|${check.bankRef}|${check.paymentDate}`
}

export default function UncashedChecksPage() {
  const router = useRouter()
  const [checks, setChecks] = useState<UncashedCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [clearingId, setClearingId] = useState<string | null>(null)

  useEffect(() => {
    fetchChecks()
  }, [])

  const fetchChecks = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendor-payments/uncashed-checks', {
        cache: 'no-store'
      })
      if (res.ok) {
        const data = await res.json()
        setChecks(normalizeUncashedChecks(data))
      }
    } catch (error) {
      console.error('Error fetching uncashed checks:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalAmount = useMemo(
    () => checks.reduce((sum, check) => sum + check.totalAmount, 0),
    [checks]
  )

  const handleMarkCleared = async (id: string) => {
    if (!confirm('Mark this check as cleared? This will deduct the amount from available funds.'))
      return

    setClearingId(id)
    try {
      const res = await fetch(`/api/vendor-payments/uncashed-checks/${encodeURIComponent(id)}/clear`, {
        method: 'PATCH'
      })
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading uncashed checks...</p>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gray-50 p-8 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Uncashed Checks</h1>
            <p className="text-sm text-gray-600 mt-1">
              {checks.length === 0
                ? 'All outstanding checks — vendor payments and cashbook expenses — until cleared at the bank'
                : `${checks.length} outstanding check${checks.length === 1 ? '' : 's'} totaling ${formatAmount(totalAmount)}`}
            </p>
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

        {checks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500 mb-4">No uncashed checks.</p>
            <button
              onClick={() => router.push('/vendor-payments/make-payment')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Make Payment
            </button>
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {checks.map((check) => (
                  <tr key={rowKey(check)} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(check.paymentDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {sourceLabel(check.source)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={check.payee}>
                      {check.payee}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">
                      {check.bankRef}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right text-gray-900">
                      {formatAmount(check.totalAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleMarkCleared(check.id)}
                        disabled={clearingId === check.id}
                        className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        {clearingId === check.id ? 'Clearing...' : 'Mark as cleared'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={4} className="px-6 py-3 text-sm font-medium text-gray-700">
                    {checks.length} check{checks.length === 1 ? '' : 's'}
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                    {formatAmount(totalAmount)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
