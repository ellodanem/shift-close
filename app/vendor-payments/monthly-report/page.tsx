'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import type {
  VendorInvoicePaymentsInclude,
  VendorInvoicePaymentsReport
} from '@/lib/vendorInvoicePaymentsReport'

function defaultMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function VendorInvoicePaymentsReportPage() {
  const router = useRouter()
  const [month, setMonth] = useState(defaultMonth)
  const [include, setInclude] = useState<VendorInvoicePaymentsInclude>('all')
  const [data, setData] = useState<VendorInvoicePaymentsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/vendor-payments/monthly?month=${encodeURIComponent(month)}&include=${include}`
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to fetch report')
        }
        const result = await res.json()
        if (!cancelled) setData(result)
      } catch (err) {
        console.error('Error fetching vendor invoice payments report:', err)
        if (!cancelled) {
          setData(null)
          setError(err instanceof Error ? err.message : 'Failed to fetch report')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [month, include])

  const handlePrint = () => {
    window.print()
  }

  const monthHint =
    include === 'paid'
      ? 'Payment month — invoices paid during this month'
      : 'Invoice month — invoices dated in this month (paid and pending)'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6 no-print">
          <h1 className="text-3xl font-bold text-gray-900">All Invoices Report</h1>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/invoices')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              ← Invoices
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Print
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 no-print space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setMonth(defaultMonth())}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Current Month
            </button>
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">Generate</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setInclude('all')}
                className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                  include === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Paid and Pending
              </button>
              <button
                type="button"
                onClick={() => setInclude('paid')}
                className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                  include === 'paid'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Paid Only
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">{monthHint}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 no-print">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 print:p-4 print-content">
          <div className="text-center mb-8 print:mb-6">
            <h2 className="text-2xl font-bold print:text-xl">All Invoices</h2>
            {data && (
              <p className="text-sm text-gray-600 mt-1 print:text-xs">
                {data.monthName}
                {data.include === 'paid' ? ' · Paid only (by payment date)' : ' · Paid and pending (by invoice date)'}
              </p>
            )}
          </div>

          {!data || data.rows.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">
                No invoices found for {data?.monthName ?? month}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm print:text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-800 text-left">
                    <th className="py-2 pr-4 font-semibold">Vendor</th>
                    <th className="py-2 px-4 font-semibold text-right">Expenses</th>
                    <th className="py-2 pl-4 font-semibold text-right">Invoice Amount</th>
                    <th className="py-2 pl-4 font-semibold w-16" aria-label="Status" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.vendorId} className="border-b border-gray-200">
                      <td className="py-2 pr-4 align-top">{row.vendorName}</td>
                      <td className="py-2 px-4 text-right align-top tabular-nums">
                        ${formatAmount(row.expenses)}
                      </td>
                      <td className="py-2 pl-4 text-right align-top tabular-nums">
                        ${formatAmount(row.invoiceAmount)}
                      </td>
                      <td className="py-2 pl-4 align-top text-gray-700">
                        {row.paidLabel ? 'Paid' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-800 font-semibold">
                    <td className="py-3 pr-4">
                      Total
                      <span className="block text-xs font-normal text-gray-500 print:text-[10px]">
                        {data.include === 'all'
                          ? '(Includes paid and pending invoices)'
                          : '(Paid invoices only)'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      ${formatAmount(data.totalExpenses)}
                    </td>
                    <td className="py-3 pl-4 text-right tabular-nums">
                      ${formatAmount(data.totalInvoiceAmount)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}
