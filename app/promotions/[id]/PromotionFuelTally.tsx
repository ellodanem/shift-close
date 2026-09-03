'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatReceiptAmount } from '@/lib/promotion-receipts'

type FuelTallyRow = {
  key: string
  staffId: string | null
  name: string
  receiptCount: number
  totalAmount: number
  lastBus: string
  lastPhone: string
  lastReceiptDate: string | null
}

type FuelTallyData = {
  year: string
  fromDate: string
  toDate: string
  totalReceipts: number
  totalAmount: number
  uniqueDrivers: number
  ranking: FuelTallyRow[]
}

const fieldClass =
  'min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:min-h-0 sm:text-sm'
const btnPrimary =
  'min-h-[44px] w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 sm:w-auto sm:min-h-0'

function formatShortDate(ymd: string | null): string {
  if (!ymd) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type Props = {
  promotionId: string
  onError: (message: string | null) => void
}

export default function PromotionFuelTally({ promotionId, onError }: Props) {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [search, setSearch] = useState('')
  const [tally, setTally] = useState<FuelTallyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const yearOptions = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  const loadTally = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ year })
    if (search.trim()) params.set('search', search.trim())
    fetch(`/api/promotions/${promotionId}/receipts/tally?${params}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load tally')
        setTally(data)
        onError(null)
      })
      .catch((err) => {
        setTally(null)
        onError(err instanceof Error ? err.message : 'Failed to load tally')
      })
      .finally(() => setLoading(false))
  }, [promotionId, year, search, onError])

  useEffect(() => {
    loadTally()
  }, [loadTally])

  const exportExcel = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ year })
      const res = await fetch(`/api/promotions/${promotionId}/receipts/export?${params}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Export failed')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = /filename="([^"]+)"/.exec(disposition)
      const filename = match?.[1] || 'promotion-tally.xlsx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Promotion tally</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Totals by driver name. Same name is combined even if phone or bus differs.
            </p>
          </div>
          <button type="button" disabled={exporting} onClick={exportExcel} className={btnPrimary}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
          <label className="block text-sm sm:w-28">
            <span className="mb-1 block text-xs font-medium text-slate-600">Year</span>
            <select value={year} onChange={(e) => setYear(e.target.value)} className={fieldClass}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={fieldClass}
              placeholder="Name, phone, or bus"
            />
          </label>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Loading tally…</p>
        ) : !tally || tally.ranking.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No receipts for {year} yet. Add receipts on the Fuel receipts tab.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Drivers</p>
                <p className="text-lg font-bold text-slate-900">{tally.uniqueDrivers}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Receipts</p>
                <p className="text-lg font-bold text-slate-900">{tally.totalReceipts}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Fuel total
                </p>
                <p className="text-lg font-bold text-slate-900">
                  $ {formatReceiptAmount(tally.totalAmount)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 md:hidden">
              {tally.ranking.map((row, idx) => (
                <div
                  key={row.key}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    <span className="mr-2 text-slate-400">#{idx + 1}</span>
                    {row.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {row.receiptCount} receipt{row.receiptCount === 1 ? '' : 's'} · ${' '}
                    {formatReceiptAmount(row.totalAmount)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.lastBus || '—'} · {row.lastPhone || '—'}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 hidden overflow-hidden rounded-lg border border-slate-200 md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">#</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Driver</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-500">Receipts</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-500">
                      Total fuel ($)
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Last bus</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Phone</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Last receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {tally.ranking.map((row, idx) => (
                    <tr key={row.key}>
                      <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                      <td className="px-4 py-2 text-right text-slate-700">{row.receiptCount}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {formatReceiptAmount(row.totalAmount)}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{row.lastBus || '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{row.lastPhone || '—'}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {formatShortDate(row.lastReceiptDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
