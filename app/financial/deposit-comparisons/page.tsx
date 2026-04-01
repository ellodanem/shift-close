'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/app/components/AuthContext'
import { formatCurrency } from '@/lib/format'

type BankStatus = 'pending' | 'cleared' | 'discrepancy'

interface Row {
  shiftId: string
  date: string
  shift: string
  supervisor: string
  lineIndex: number
  amount: number
  depositScanUrls: string[]
  securitySlipUrl: string | null
  bankStatus: BankStatus
  notes: string
}

interface Totals {
  count: number
  sumAmount: number
  pending: number
  cleared: number
  discrepancy: number
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function scanLabelFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').filter(Boolean).pop()
    if (last) return decodeURIComponent(last)
  } catch {
    /* ignore */
  }
  const fallback = url.split('/').pop()
  return fallback ? decodeURIComponent(fallback.split('?')[0]) : 'Document'
}

const STATUS_OPTIONS: { value: BankStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending (bank)' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'discrepancy', label: 'Discrepancy' }
]

function statusBadgeClass(s: BankStatus): string {
  if (s === 'cleared') return 'bg-emerald-100 text-emerald-900 border-emerald-200'
  if (s === 'discrepancy') return 'bg-amber-100 text-amber-900 border-amber-200'
  return 'bg-slate-100 text-slate-800 border-slate-200'
}

export default function DepositComparisonsPage() {
  const { isStakeholder } = useAuth()
  const defaults = useMemo(() => {
    const today = new Date()
    return {
      from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: ymd(today)
    }
  }, [])

  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]['value']>('all')
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      if (statusFilter !== 'all') q.set('status', statusFilter)
      const res = await fetch(`/api/financial/deposit-comparisons?${q.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setTotals(data.totals ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setRows([])
      setTotals(null)
    } finally {
      setLoading(false)
    }
  }, [from, to, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const patchRow = async (
    shiftId: string,
    lineIndex: number,
    body: Partial<{ bankStatus: BankStatus; notes: string }>
  ) => {
    const key = `${shiftId}:${lineIndex}`
    setSavingKey(key)
    setError(null)
    try {
      const res = await fetch('/api/financial/deposit-comparisons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, lineIndex, ...body })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Save failed')
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingKey(null)
    }
  }

  const setPreset = (preset: 'month' | '30' | '90') => {
    const today = new Date()
    const toStr = ymd(today)
    if (preset === 'month') {
      setFrom(ymd(new Date(today.getFullYear(), today.getMonth(), 1)))
      setTo(toStr)
      return
    }
    const days = preset === '30' ? 30 : 90
    const start = new Date(today)
    start.setDate(start.getDate() - days)
    setFrom(ymd(start))
    setTo(toStr)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-[1200px] mx-auto space-y-6">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/financial/cashbook" className="font-medium text-blue-600 hover:text-blue-800">
            ← Cashbook
          </Link>
          <Link href="/insights/deposit-debit-scans" className="font-medium text-blue-600 hover:text-blue-800">
            Deposit & debit scans (Insights)
          </Link>
        </div>
        <div>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Deposit comparisons</h1>
          <p className="mt-1 text-sm text-gray-600 max-w-3xl">
            Review every recorded deposit line from closed shifts, match against the bank, and mark each line as pending,
            cleared, or discrepancy. Deposit slips link to uploaded scans; security slip upload is planned for a later
            release.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm min-w-[11rem]"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-500 self-center mr-1">Quick range:</span>
            <button
              type="button"
              onClick={() => setPreset('month')}
              className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
            >
              This month
            </button>
            <button
              type="button"
              onClick={() => setPreset('30')}
              className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
            >
              Last 30 days
            </button>
            <button
              type="button"
              onClick={() => setPreset('90')}
              className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
            >
              Last 90 days
            </button>
          </div>
        </div>

        {totals && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-lg border p-3 shadow-sm">
              <div className="text-xs text-gray-500 uppercase">Lines</div>
              <div className="text-lg font-semibold tabular-nums">{totals.count}</div>
            </div>
            <div className="bg-white rounded-lg border p-3 shadow-sm">
              <div className="text-xs text-gray-500 uppercase">Total amount</div>
              <div className="text-lg font-semibold tabular-nums">{formatCurrency(totals.sumAmount)}</div>
            </div>
            <div className="bg-white rounded-lg border p-3 shadow-sm border-slate-200">
              <div className="text-xs text-gray-500 uppercase">Pending</div>
              <div className="text-lg font-semibold tabular-nums text-slate-800">{totals.pending}</div>
            </div>
            <div className="bg-white rounded-lg border p-3 shadow-sm border-emerald-200">
              <div className="text-xs text-gray-500 uppercase">Cleared</div>
              <div className="text-lg font-semibold tabular-nums text-emerald-800">{totals.cleared}</div>
            </div>
            <div className="bg-white rounded-lg border p-3 shadow-sm border-amber-200">
              <div className="text-xs text-gray-500 uppercase">Discrepancy</div>
              <div className="text-lg font-semibold tabular-nums text-amber-900">{totals.discrepancy}</div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-gray-500">Loading deposits…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-gray-600">No deposit lines in this range. Try widening the dates or clearing the status filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-2 whitespace-nowrap">Date</th>
                    <th className="px-3 py-2 whitespace-nowrap">Shift</th>
                    <th className="px-3 py-2 whitespace-nowrap">Supervisor</th>
                    <th className="px-3 py-2 whitespace-nowrap">Line</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Amount</th>
                    <th className="px-3 py-2 whitespace-nowrap">Bank status</th>
                    <th className="px-3 py-2 min-w-[140px]">Deposit slip</th>
                    <th className="px-3 py-2 min-w-[120px]">Security slip</th>
                    <th className="px-3 py-2 min-w-[200px]">Notes</th>
                    <th className="px-3 py-2 whitespace-nowrap">Shift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => {
                    const key = `${r.shiftId}:${r.lineIndex}`
                    const busy = savingKey === key
                    return (
                      <tr key={key} className="hover:bg-gray-50/80 align-top">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-900">{r.date}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-800">{r.shift}</td>
                        <td className="px-3 py-2 text-gray-700">{r.supervisor}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-600">#{r.lineIndex + 1}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(r.amount)}</td>
                        <td className="px-3 py-2">
                          <select
                            disabled={busy}
                            value={r.bankStatus}
                            onChange={(e) =>
                              void patchRow(r.shiftId, r.lineIndex, { bankStatus: e.target.value as BankStatus })
                            }
                            className={`text-sm rounded border px-2 py-1 max-w-[11rem] ${statusBadgeClass(r.bankStatus)}`}
                          >
                            <option value="pending">Pending</option>
                            <option value="cleared">Cleared</option>
                            <option value="discrepancy">Discrepancy</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {r.depositScanUrls.length === 0 ? (
                            <span className="text-gray-400 text-xs">No scan uploaded</span>
                          ) : (
                            <ul className="space-y-1">
                              {r.depositScanUrls.map((url, i) => (
                                <li key={`${url}-${i}`}>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 underline text-xs break-all"
                                  >
                                    {r.depositScanUrls.length > 1 ? `Slip ${i + 1}: ` : ''}
                                    {scanLabelFromUrl(url)}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.securitySlipUrl ? (
                            <a
                              href={r.securitySlipUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline text-xs break-all"
                            >
                              View security slip
                            </a>
                          ) : (
                            <span
                              className="inline-flex items-center rounded border border-dashed border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-500"
                              title="Upload flow not available yet"
                            >
                              Not uploaded — coming soon
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <NotesCell
                            initial={r.notes}
                            disabled={busy}
                            onSave={(notes) => void patchRow(r.shiftId, r.lineIndex, { notes })}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Link href={`/shifts/${r.shiftId}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                            Open shift
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NotesCell({
  initial,
  disabled,
  onSave
}: {
  initial: string
  disabled: boolean
  onSave: (notes: string) => void
}) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    setValue(initial)
  }, [initial])

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Bank ref, variance, etc."
        className="w-full min-w-[180px] rounded border border-gray-300 px-2 py-1 text-xs"
      />
      <button
        type="button"
        disabled={disabled || value === initial}
        onClick={() => onSave(value)}
        className="self-start text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40"
      >
        Save note
      </button>
    </div>
  )
}
