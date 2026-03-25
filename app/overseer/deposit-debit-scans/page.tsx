'use client'

import { useCallback, useEffect, useState } from 'react'

interface ScanRow {
  date: string
  depositScanUrls: string[]
  debitScanUrls: string[]
}

export default function DepositDebitScansPage() {
  const today = new Date()
  const defaultEnd = today.toISOString().slice(0, 10)
  const start = new Date(today)
  start.setDate(start.getDate() - 30)
  const defaultStart = start.toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [rows, setRows] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      const res = await fetch(`/api/overseer/scans?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load scans')
      const data = await res.json()
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    void load()
  }, [load])

  const hasAny =
    rows.some(
      (r) => (r.depositScanUrls?.length ?? 0) > 0 || (r.debitScanUrls?.length ?? 0) > 0
    )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Deposit & debit scans</h1>
        <p className="text-sm text-gray-600 mb-6">
          End-of-day deposit and debit scans grouped by <strong>calendar day</strong> (one section per day). Attachments
          from all shifts that day are merged; duplicate links appear once. Use the date range to search.
        </p>

        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            Search
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : !hasAny ? (
          <p className="text-gray-600">No deposit or debit scans in this date range.</p>
        ) : (
          <div className="space-y-6">
            {rows.map((row) => {
              const dep = row.depositScanUrls?.length ? row.depositScanUrls : []
              const deb = row.debitScanUrls?.length ? row.debitScanUrls : []
              if (dep.length === 0 && deb.length === 0) return null
              return (
                <div key={row.date} className="bg-white rounded-lg border border-gray-200 p-4">
                  <h2 className="font-semibold text-gray-900 mb-2">{row.date}</h2>
                  {dep.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Deposits</div>
                      <ul className="space-y-1">
                        {dep.map((url, i) => (
                          <li key={i}>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm hover:underline break-all">
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {deb.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Debits</div>
                      <ul className="space-y-1">
                        {deb.map((url, i) => (
                          <li key={i}>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm hover:underline break-all">
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
