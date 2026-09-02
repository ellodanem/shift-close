'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import type {
  MonthlyReportExpenseRow,
  VendorInvoicePaymentsInclude,
  VendorInvoicePaymentsReport
} from '@/lib/vendorInvoicePaymentsReport'
import { AddMonthlyExpenseModal } from '../components/AddMonthlyExpenseModal'

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
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<MonthlyReportExpenseRow | null>(null)

  const fetchReport = useCallback(async (opts?: { keepVisible?: boolean }) => {
    if (!opts?.keepVisible) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await fetch(
        `/api/vendor-payments/monthly?month=${encodeURIComponent(month)}&include=${include}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to fetch report')
      }
      const result = await res.json()
      setData({
        ...result,
        additionalExpenses: Array.isArray(result.additionalExpenses)
          ? result.additionalExpenses
          : []
      })
      if (opts?.keepVisible) setError(null)
    } catch (err) {
      console.error('Error fetching vendor invoice payments report:', err)
      if (!opts?.keepVisible) setData(null)
      setError(err instanceof Error ? err.message : 'Failed to fetch report')
    } finally {
      if (!opts?.keepVisible) setLoading(false)
    }
  }, [month, include])

  useEffect(() => {
    void fetchReport()
  }, [fetchReport])

  const openAddExpense = () => {
    setEditingExpense(null)
    setExpenseModalOpen(true)
  }

  const openEditExpense = (row: MonthlyReportExpenseRow) => {
    setEditingExpense(row)
    setExpenseModalOpen(true)
  }

  const handleDeleteExpense = async (row: MonthlyReportExpenseRow) => {
    const cashbookNote = row.inCashbook ? ' This will also remove it from the cashbook.' : ''
    if (!confirm(`Delete “${row.description}”?${cashbookNote}`)) return
    try {
      const res = await fetch(`/api/vendor-payments/monthly-expenses/${row.id}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete expense')
      }
      await fetchReport({ keepVisible: true })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete expense')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const monthHint =
    include === 'paid'
      ? 'Payment month — invoices paid during this month'
      : 'Invoice month — invoices dated in this month (paid and pending)'

  const includeChipClass = (active: boolean) =>
    `min-h-[44px] rounded px-4 py-2 text-sm font-semibold transition-colors sm:min-h-0 ${
      active
        ? 'bg-blue-600 text-white'
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  const hasRows =
    data != null &&
    (data.rows.length > 0 || (data.additionalExpenses?.length ?? 0) > 0)

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-4 no-print sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            All Invoices Report
          </h1>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-2">
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/invoices')}
              className="min-h-[44px] rounded bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 sm:min-h-0"
            >
              ← Invoices
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
            >
              Print
            </button>
          </div>
        </div>

        <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm no-print">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
            <div className="w-full sm:w-auto">
              <label className="mb-2 block text-sm font-medium text-gray-700">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:w-auto"
              />
            </div>
            <button
              type="button"
              onClick={() => setMonth(defaultMonth())}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
            >
              Current Month
            </button>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-gray-700">Generate</span>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:gap-2">
              <button
                type="button"
                onClick={() => setInclude('all')}
                className={includeChipClass(include === 'all')}
              >
                Paid and Pending
              </button>
              <button
                type="button"
                onClick={() => setInclude('paid')}
                className={includeChipClass(include === 'paid')}
              >
                Paid Only
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">{monthHint}</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 no-print">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm print-content print:p-4 sm:p-8">
          <div className="mb-6 text-center print:mb-6 sm:mb-8">
            <h2 className="text-xl font-bold print:text-xl sm:text-2xl">All Invoices</h2>
            {data && (
              <p className="mt-1 text-sm text-gray-600 print:text-xs">
                {data.monthName}
                {data.include === 'paid'
                  ? ' · Paid only (by payment date)'
                  : ' · Paid and pending (by invoice date)'}
              </p>
            )}
          </div>

          {data && (
            <>
              <div className="mb-4 flex items-center justify-between gap-2 no-print print:hidden md:hidden">
                <span className="text-sm font-medium text-gray-700">Expenses</span>
                <button
                  type="button"
                  onClick={openAddExpense}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-gray-300 text-lg font-semibold text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                  aria-label="Add additional expense"
                  title="Add additional expense"
                >
                  +
                </button>
              </div>

              {!hasRows ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  No invoices found for {data.monthName}
                </p>
              ) : (
                <>
                  <div className="space-y-3 md:hidden print:hidden">
                    {data.rows.map((row) => (
                      <div
                        key={row.vendorId}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 font-medium text-gray-900">
                            {row.vendorName}
                          </div>
                          {row.paidLabel ? (
                            <span className="shrink-0 text-xs font-semibold text-green-700">
                              Paid
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <div className="text-xs text-gray-500">Expenses</div>
                            <div className="font-mono font-semibold tabular-nums text-gray-900">
                              ${formatAmount(row.expenses)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500">Invoice Amount</div>
                            <div className="font-mono font-semibold tabular-nums text-gray-900">
                              ${formatAmount(row.invoiceAmount)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {(data.additionalExpenses ?? []).map((row) => (
                      <div
                        key={row.id}
                        className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{row.description}</div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              Additional
                              {row.inCashbook ? ' · Cashbook' : ''}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono font-semibold tabular-nums text-gray-900">
                            ${formatAmount(row.amount)}
                          </span>
                        </div>
                        <div className="mt-3 flex gap-4 border-t border-gray-100 pt-3">
                          <button
                            type="button"
                            onClick={() => openEditExpense(row)}
                            className="min-h-[44px] text-sm font-medium text-blue-600 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteExpense(row)}
                            className="min-h-[44px] text-sm font-medium text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="rounded-lg border-2 border-gray-400 bg-white p-3">
                      <div className="text-sm font-bold text-gray-900">Total</div>
                      <p className="mt-0.5 text-xs font-normal text-gray-500">
                        {data.include === 'all'
                          ? '(Includes paid and pending invoices)'
                          : '(Paid invoices only)'}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-gray-500">Expenses</div>
                          <div className="font-mono text-base font-bold tabular-nums text-gray-900">
                            ${formatAmount(data.totalExpenses)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Invoice Amount</div>
                          <div className="font-mono text-base font-bold tabular-nums text-gray-900">
                            ${formatAmount(data.totalInvoiceAmount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden overflow-x-auto md:block print:block">
                    <table className="w-full border-collapse text-sm print:text-xs">
                      <thead>
                        <tr className="border-b-2 border-gray-800 text-left">
                          <th className="py-2 pr-4 font-semibold">Vendor</th>
                          <th className="px-4 py-2 text-right font-semibold">
                            <span className="inline-flex items-center justify-end gap-1.5">
                              Expenses
                              <button
                                type="button"
                                onClick={openAddExpense}
                                className="no-print inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-base font-semibold leading-none text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 print:hidden"
                                aria-label="Add additional expense"
                                title="Add additional expense"
                              >
                                +
                              </button>
                            </span>
                          </th>
                          <th className="py-2 pl-4 text-right font-semibold">
                            Invoice Amount
                          </th>
                          <th className="w-24 py-2 pl-4 font-semibold" aria-label="Status" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => (
                          <tr key={row.vendorId} className="border-b border-gray-200">
                            <td className="py-2 pr-4 align-top">{row.vendorName}</td>
                            <td className="px-4 py-2 text-right align-top tabular-nums">
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
                        {(data.additionalExpenses ?? []).map((row) => (
                          <tr key={row.id} className="border-b border-gray-200">
                            <td className="py-2 pr-4 align-top">
                              {row.description}
                              <span className="ml-2 text-xs font-normal text-gray-500 print:hidden">
                                Additional
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right align-top tabular-nums">
                              ${formatAmount(row.amount)}
                            </td>
                            <td className="py-2 pl-4 text-right align-top tabular-nums text-gray-400">
                              —
                            </td>
                            <td className="py-2 pl-4 align-top text-gray-700">
                              <span className="inline-flex flex-wrap items-center gap-2">
                                {row.inCashbook ? (
                                  <span className="text-xs text-gray-500">Cashbook</span>
                                ) : null}
                                <span className="no-print inline-flex gap-2 print:hidden">
                                  <button
                                    type="button"
                                    onClick={() => openEditExpense(row)}
                                    className="text-xs font-medium text-blue-600 hover:underline"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteExpense(row)}
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </span>
                              </span>
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
                          <td className="px-4 py-3 text-right tabular-nums">
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
                </>
              )}
            </>
          )}
        </div>
      </div>

      <AddMonthlyExpenseModal
        open={expenseModalOpen}
        onClose={() => {
          setExpenseModalOpen(false)
          setEditingExpense(null)
        }}
        month={month}
        monthName={data?.monthName ?? month}
        editing={editingExpense}
        onSaved={() => void fetchReport({ keepVisible: true })}
      />

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
