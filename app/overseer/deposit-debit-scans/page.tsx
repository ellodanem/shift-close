'use client'

import { useCallback, useEffect, useState } from 'react'

interface ScanRow {
  date: string
  depositScanUrls: string[]
  debitScanUrls: string[]
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

function formatDayHeading(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return isoDate
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(d)
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  )
}

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  )
}

function ScanLinkList({ urls, accentClass, label }: { urls: string[]; accentClass: string; label: string }) {
  return (
    <div className={`rounded-lg border border-gray-100 bg-gray-50/80 pl-3 pr-2 py-3 ${accentClass}`}>
      <div className="mb-2 flex items-center gap-2 pl-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{label}</span>
        <span className="text-[10px] text-gray-400">({urls.length})</span>
      </div>
      <ul className="space-y-2">
        {urls.map((url, i) => {
          const n = i + 1
          const fileLabel = scanLabelFromUrl(url)
          const display =
            fileLabel.length > 56 ? `${fileLabel.slice(0, 53)}…` : fileLabel
          return (
            <li key={`${url}-${i}`}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={url}
                className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:shadow"
              >
                <PdfIcon className="shrink-0 text-red-500 opacity-90" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-gray-900 group-hover:text-blue-700">{display}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">PDF · #{n}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600 group-hover:text-blue-700">
                  Open
                  <ExternalIcon className="text-blue-500" />
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      {[0, 1].map((k) => (
        <div key={k} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 h-6 w-48 rounded bg-gray-200" />
          <div className="mb-3 space-y-2">
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="h-12 rounded-lg bg-gray-100" />
            <div className="h-12 rounded-lg bg-gray-100" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-12 rounded-lg bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  )
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

  const hasAny = rows.some(
    (r) => (r.depositScanUrls?.length ?? 0) > 0 || (r.debitScanUrls?.length ?? 0) > 0
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100/80 to-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Deposit & debit scans</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
          End-of-day deposit and debit scans grouped by <strong>calendar day</strong> (one section per day). Attachments
          from all shifts that day are merged; duplicate links appear once. Use the date range to search.
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
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Search
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {loading ? (
          <div className="mt-8">
            <p className="mb-4 text-sm text-gray-500">Loading scans…</p>
            <LoadingSkeleton />
          </div>
        ) : !hasAny ? (
          <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white/60 px-6 py-10 text-center text-gray-600 shadow-sm">
            <p className="font-medium text-gray-800">No scans in this range</p>
            <p className="mt-1 text-sm text-gray-500">Try widening the date range or pick different dates.</p>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {rows.map((row) => {
              const dep = row.depositScanUrls?.length ? row.depositScanUrls : []
              const deb = row.debitScanUrls?.length ? row.debitScanUrls : []
              if (dep.length === 0 && deb.length === 0) return null
              return (
                <article
                  key={row.date}
                  className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/5"
                >
                  <div className="border-b border-gray-100 bg-gray-50/90 px-5 py-4">
                    <h2 className="text-lg font-semibold text-gray-900">{formatDayHeading(row.date)}</h2>
                    <p className="mt-0.5 font-mono text-xs text-gray-500">{row.date}</p>
                  </div>
                  <div className="space-y-4 p-5">
                    {dep.length > 0 && (
                      <ScanLinkList urls={dep} label="Deposits" accentClass="border-l-4 border-l-emerald-500" />
                    )}
                    {deb.length > 0 && (
                      <ScanLinkList urls={deb} label="Debits" accentClass="border-l-4 border-l-amber-500" />
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
