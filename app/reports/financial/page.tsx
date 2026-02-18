'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface CashbookSummary {
  startDate: string
  endDate: string
  totalIncome: number
  totalExpense: number
  totalOther: number
  netIncome: number
  byCategory: Array<{ id: string; name: string; type: string; amount: number }>
  debits: { cash: number; check?: number; ecard: number; dcard: number }
  credit: number
  entryCount: number
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n)
}

export default function FinancialReportPage() {
  const router = useRouter()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [summary, setSummary] = useState<CashbookSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = (() => {
    const d = new Date(year, month, 0)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/financial/cashbook/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load financial summary')
        }
        const data: CashbookSummary = await res.json()
        setSummary(data)
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to load financial summary')
        setSummary(null)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [startDate, endDate])

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Financial Report</h1>
        </div>

        {/* Month Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
            <p className="mt-2 text-xs text-red-600">
              Make sure the cashbook tables exist. Run{' '}
              <code className="bg-red-100 px-1 rounded">scripts/neon-apply-cashbook-tables.sql</code>{' '}
              in Neon SQL Editor if needed.
            </p>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-600">
            Loading financial summary…
          </div>
        ) : summary ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Income</h3>
                <p className="mt-1 text-2xl font-bold text-green-600">
                  ${formatCurrency(summary.totalIncome)}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Expenses</h3>
                <p className="mt-1 text-2xl font-bold text-red-600">
                  ${formatCurrency(summary.totalExpense)}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Net Income
                </h3>
                <p
                  className={`mt-1 text-2xl font-bold ${
                    summary.netIncome >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  ${formatCurrency(summary.netIncome)}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Entries</h3>
                <p className="mt-1 text-2xl font-bold text-gray-900">{summary.entryCount}</p>
              </div>
            </div>

            {/* Debits / Credit (reconciliation) */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Debits & Credit</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Debit Cash</span>
                  <p className="font-medium">${formatCurrency(summary.debits.cash)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Debit Check</span>
                  <p className="font-medium">${formatCurrency(summary.debits.check ?? 0)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Debit EFT/Deposit</span>
                  <p className="font-medium">${formatCurrency(summary.debits.ecard)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Debit/Credit Card</span>
                  <p className="font-medium">${formatCurrency(summary.debits.dcard)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Credit</span>
                  <p className="font-medium">${formatCurrency(summary.credit)}</p>
                </div>
              </div>
            </div>

            {/* By Category */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">By Category</h3>
              {summary.byCategory.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No cashbook entries in this period. Add entries in the{' '}
                  <button
                    onClick={() => router.push('/financial/cashbook')}
                    className="text-amber-600 hover:underline font-medium"
                  >
                    Cashbook
                  </button>
                  .
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-700">Category</th>
                      <th className="text-left py-2 font-medium text-gray-700">Type</th>
                      <th className="text-right py-2 font-medium text-gray-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byCategory.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100">
                        <td className="py-2">{c.name}</td>
                        <td className="py-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              c.type === 'income'
                                ? 'bg-green-100 text-green-800'
                                : c.type === 'expense'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {c.type}
                          </span>
                        </td>
                        <td className="py-2 text-right font-medium">
                          {c.type === 'expense' ? '-' : ''}${formatCurrency(Math.abs(c.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : !error ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-600">
            No data for this period.
          </div>
        ) : null}
      </div>
    </div>
  )
}
