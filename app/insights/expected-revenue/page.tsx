'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface DayRow {
  date: string
  grandTotal: number
  shiftCount: number
}

interface RevenuePayload {
  startDate: string
  endDate: string
  grandTotal: number
  totalDeposits: number
  totalDebitAndCredit: number
  totalDebit: number
  totalCredit: number
  totalFleet: number
  totalVouchers: number
  shiftCount: number
  byDay: DayRow[]
}

export default function ExpectedRevenuePage() {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const startDefault = new Date(today)
  startDefault.setDate(startDefault.getDate() - 2)
  const fromDefault = startDefault.toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(fromDefault)
  const [endDate, setEndDate] = useState(todayIso)
  const [data, setData] = useState<RevenuePayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (startDate > endDate) {
      setError('"From" must be on or before "To".')
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      const res = await fetch(`/api/insights/expected-revenue?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to load')
      }
      const json = (await res.json()) as RevenuePayload
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100/90 to-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-semibold text-blue-900">
            Expected revenue
          </span>
          <Link
            href="/insights/deposit-debit-scans"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
          >
            Deposit & debit scans
          </Link>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Expected revenue</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
          Choose any <strong>start and end date</strong> (inclusive). Totals come from <strong>shift close</strong> data
          in that range and match the dashboard <strong>Grand Total</strong> formula: deposits + debit &amp; credit +
          fleet + vouchers. Use this when you need a forecast for a window that doesn&apos;t line up with bank posting
          (e.g. weekend activity vs Monday settlement), or for any mid-week range you want to compare.
        </p>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 flex-1 sm:max-w-[200px]">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="min-w-0 flex-1 sm:max-w-[200px]">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Calculating…' : 'Calculate'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {data && !error && (
          <div className="mt-8 space-y-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Grand total (range)</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-950">${formatMoney(data.grandTotal)}</p>
              <p className="mt-2 text-xs text-emerald-900/90">
                {data.shiftCount} shift{data.shiftCount === 1 ? '' : 'es'} · {data.startDate} → {data.endDate}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Components</h2>
              <p className="text-xs text-gray-500 mb-3">
                Same breakdown as the dashboard summary.{' '}
                <span className="text-gray-600">
                  Debit (system) is the POS system debit total. Credit (other) is the Other Items credit amount, separate from the
                  main Credits row on the close form.
                </span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[16rem] text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 pr-8 text-gray-600">Total deposits</td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                        ${formatMoney(data.totalDeposits)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 pr-8 pt-3 text-xs font-medium uppercase tracking-wide text-gray-500" colSpan={2}>
                        Card / electronic
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 pr-8 pl-1 text-gray-900 font-medium">Total</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                        ${formatMoney(data.totalDebitAndCredit)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 pr-8 pl-4 text-xs text-gray-600">Debit (system)</td>
                      <td className="py-2 text-right text-xs font-medium tabular-nums text-gray-800 whitespace-nowrap">
                        ${formatMoney(data.totalDebit)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 pr-8 pl-4 text-xs text-gray-600">Credit (other)</td>
                      <td className="py-2 text-right text-xs font-medium tabular-nums text-gray-800 whitespace-nowrap">
                        ${formatMoney(data.totalCredit)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 pr-8 text-gray-600">Fleet</td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                        ${formatMoney(data.totalFleet)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 pr-8 text-gray-600">Vouchers / coupons</td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                        ${formatMoney(data.totalVouchers)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {data.byDay.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">By day</h2>
                <p className="text-xs text-gray-500 mb-3">Per calendar day within the range.</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-600">
                        <th className="py-2 pr-4 font-medium">Date</th>
                        <th className="py-2 pr-4 font-medium">Shifts</th>
                        <th className="py-2 font-medium text-right">Day total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDay.map((row) => (
                        <tr key={row.date} className="border-b border-gray-100">
                          <td className="py-2 pr-4 font-mono text-gray-900">{row.date}</td>
                          <td className="py-2 pr-4 text-gray-700">{row.shiftCount}</td>
                          <td className="py-2 text-right font-medium tabular-nums text-gray-900">
                            ${formatMoney(row.grandTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
