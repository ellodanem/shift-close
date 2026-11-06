'use client'

import { useEffect, useState } from 'react'
import { formatAmount } from '@/lib/fuelPayments'
import { formatCstoreDisplayDate } from '@/lib/parse-customer-credit-report'

interface DailyCustomer {
  account: string
  total: number
  lines: { id: string; amount: number; memo: string | null; ref: string | null }[]
}

interface DailyResult {
  date: string
  customers: DailyCustomer[]
  total: number
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function defaultDate(monthKey: string): string {
  const now = new Date()
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (monthKey === current) {
    return `${current}-${String(now.getDate()).padStart(2, '0')}`
  }
  return `${monthKey}-01`
}

export default function DailyChargesPanel({
  monthKey,
  onOpenLedger
}: {
  monthKey: string
  onOpenLedger: (account: string) => void
}) {
  const [date, setDate] = useState(() => defaultDate(monthKey))
  const [data, setData] = useState<DailyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Follow the working month when it changes
  useEffect(() => {
    setDate((prev) => (prev.startsWith(monthKey) ? prev : defaultDate(monthKey)))
  }, [monthKey])

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/customer-accounts/daily?date=${date}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load daily charges')
        return (await res.json()) as DailyResult
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null)
          setError(err instanceof Error ? err.message : 'Failed to load daily charges')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date])

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Charges by day</h2>
          <p className="text-xs text-gray-500">
            Who charged on a given day and how much.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="min-h-[44px] rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 sm:min-h-0"
            aria-label="Previous day"
          >
            ‹
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="min-h-[44px] rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0"
          />
          <button
            type="button"
            onClick={() => setDate((d) => shiftDate(d, 1))}
            className="min-h-[44px] rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 sm:min-h-0"
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data || data.customers.length === 0 ? (
        <p className="text-sm text-gray-500">
          No charges on {formatCstoreDisplayDate(date)}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">
                  Customer
                </th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">
                  Details
                </th>
                <th className="px-4 py-2 text-right font-semibold text-gray-700">
                  Charged
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.customers.map((c) => (
                <tr
                  key={c.account}
                  className="cursor-pointer align-top hover:bg-indigo-50/40"
                  onClick={() => onOpenLedger(c.account)}
                >
                  <td className="px-4 py-2 font-medium text-gray-900">{c.account}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {c.lines.length > 1
                      ? c.lines
                          .map(
                            (l) =>
                              `${formatAmount(l.amount)}${l.memo || l.ref ? ` (${l.memo || l.ref})` : ''}`
                          )
                          .join(', ')
                      : c.lines[0]?.memo || c.lines[0]?.ref || '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatAmount(c.total)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-semibold">
                <td className="px-4 py-2 text-gray-900">
                  Total ({data.customers.length} customer
                  {data.customers.length === 1 ? '' : 's'})
                </td>
                <td />
                <td className="px-4 py-2 text-right font-mono">
                  {formatAmount(data.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
