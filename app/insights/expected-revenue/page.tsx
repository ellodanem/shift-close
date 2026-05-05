'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { businessTodayYmd } from '@/lib/datetime-policy'

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface DayRow {
  date: string
  grandTotal: number
  depositsAndCardTotal: number
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
  const todayIso = businessTodayYmd()

  /** No preset range — user picks From/To, then Calculate. */
  const [startDate, setStartDate] = useState(todayIso)
  const [endDate, setEndDate] = useState(todayIso)
  const [data, setData] = useState<RevenuePayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** When true, grand total and by-day amounts exclude fleet & vouchers (deposits + card only). */
  const [depositsAndCardOnly, setDepositsAndCardOnly] = useState(false)

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

  /** Clear previous results when the range changes so totals aren’t shown for stale dates. */
  useEffect(() => {
    setData(null)
    setError(null)
  }, [startDate, endDate])

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
          Pick <strong>From</strong> and <strong>To</strong> (inclusive), then <strong>Calculate</strong>. Totals come from <strong>shift close</strong> data
          in that range and match the dashboard <strong>Grand Total</strong> formula: deposits + debit &amp; credit +
          fleet + vouchers. Fleet and vouchers are often settled on a different schedule; use <strong>Exclude fleet &amp; vouchers</strong>{' '}
          on the summary card for <strong>deposits + card only</strong>. Use this page when you need a forecast for a window that
          doesn&apos;t line up with bank posting (e.g. weekend activity vs Monday settlement), or for any mid-week range you want
          to compare.
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

        {!data && !loading && !error && (
          <p className="mt-4 text-sm text-gray-500">Select your date range and click Calculate to load totals.</p>
        )}

        {data && !error && (
          <div className="mt-8 space-y-6">
            <div className="relative rounded-xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm">
              <label className="absolute right-4 top-4 flex max-w-[11rem] cursor-pointer select-none items-start gap-2 sm:right-5 sm:top-5">
                <input
                  type="checkbox"
                  checked={depositsAndCardOnly}
                  onChange={(e) => setDepositsAndCardOnly(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-emerald-400 text-emerald-700 focus:ring-emerald-600"
                />
                <span className="text-[11px] leading-snug text-emerald-900/90">Exclude fleet &amp; vouchers</span>
              </label>
              <div className="max-w-full pr-[9.5rem] sm:pr-[10.5rem]">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Grand total (range)</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-950">
                  $
                  {formatMoney(
                    depositsAndCardOnly
                      ? data.totalDeposits + data.totalDebitAndCredit
                      : data.grandTotal
                  )}
                </p>
                <p className="mt-2 text-xs text-emerald-900/90">
                  {data.shiftCount} shift{data.shiftCount === 1 ? '' : 'es'} · {data.startDate} → {data.endDate}
                </p>
                {depositsAndCardOnly && (
                  <p className="mt-1.5 text-xs text-emerald-800/95">
                    Deposits + card only (fleet &amp; vouchers excluded).
                  </p>
                )}
              </div>
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
                <p className="text-xs text-gray-500 mb-3">
                  Per calendar day within the range.
                  {depositsAndCardOnly && (
                    <span className="text-gray-600"> Day totals match deposits + card (fleet &amp; vouchers excluded).</span>
                  )}
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-600">
                        <th className="py-2 pr-4 font-medium">Date</th>
                        <th className="py-2 pr-4 font-medium">Shifts</th>
                        <th className="py-2 font-medium text-right">
                          {depositsAndCardOnly ? 'Day total (dep. + card)' : 'Day total'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDay.map((row) => (
                        <tr key={row.date} className="border-b border-gray-100">
                          <td className="py-2 pr-4 font-mono text-gray-900">{row.date}</td>
                          <td className="py-2 pr-4 text-gray-700">{row.shiftCount}</td>
                          <td className="py-2 text-right font-medium tabular-nums text-gray-900">
                            $
                            {formatMoney(depositsAndCardOnly ? row.depositsAndCardTotal : row.grandTotal)}
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
