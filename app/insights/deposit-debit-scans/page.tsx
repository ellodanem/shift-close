'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { pdfIframeSrc } from '@/lib/pdf-iframe-src'

interface ScanRow {
  date: string
  depositScanUrls: string[]
  debitScanUrls: string[]
  securityScanUrls: string[]
}

type ScanKind = 'deposit' | 'debit' | 'security'

interface SelectableScan {
  id: string
  date: string
  kind: ScanKind
  url: string
  label: string
}

function buildScanId(date: string, kind: ScanKind, url: string): string {
  return `${encodeURIComponent(date)}|${kind}|${encodeURIComponent(url)}`
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

function ScanLinkList({
  scans,
  accentClass,
  label,
  allSelected,
  onToggleAll,
  selectedIds,
  onToggleOne,
  onPreview
}: {
  scans: SelectableScan[]
  accentClass: string
  label: string
  allSelected: boolean
  onToggleAll: () => void
  selectedIds: Set<string>
  onToggleOne: (scan: SelectableScan) => void
  onPreview: (scan: SelectableScan) => void
}) {
  return (
    <div className={`rounded-lg border border-gray-100 bg-gray-50/80 pl-3 pr-2 py-3 ${accentClass}`}>
      <div className="mb-2 flex items-center justify-between gap-2 pl-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{label}</span>
          <span className="text-[10px] text-gray-400">({scans.length})</span>
        </div>
        <button
          type="button"
          onClick={onToggleAll}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
        >
          {allSelected ? 'Clear section' : 'Select section'}
        </button>
      </div>
      <ul className="space-y-2">
        {scans.map((scan, i) => {
          const n = i + 1
          const display = scan.label.length > 56 ? `${scan.label.slice(0, 53)}…` : scan.label
          return (
            <li key={scan.id}>
              <div className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:shadow">
                <input
                  type="checkbox"
                  checked={selectedIds.has(scan.id)}
                  onChange={() => onToggleOne(scan)}
                  aria-label={`Select ${scan.label}`}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <PdfIcon className="shrink-0 text-red-500 opacity-90" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-gray-900 group-hover:text-blue-700">{display}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">PDF · #{n}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onPreview(scan)}
                  title={scan.url}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  View
                </button>
              </div>
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

type SearchMode = 'single' | 'range'

export default function DepositDebitScansPage() {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const start = new Date(today)
  start.setDate(start.getDate() - 30)
  const defaultRangeStart = start.toISOString().slice(0, 10)

  const [searchMode, setSearchMode] = useState<SearchMode>('single')
  const [singleDate, setSingleDate] = useState(todayIso)
  const [rangeStart, setRangeStart] = useState(defaultRangeStart)
  const [rangeEnd, setRangeEnd] = useState(todayIso)
  const [rows, setRows] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedById, setSelectedById] = useState<Record<string, SelectableScan>>({})
  const [emailTo, setEmailTo] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [shareMessage, setShareMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [previewScan, setPreviewScan] = useState<SelectableScan | null>(null)

  const selectedIds = useMemo(() => new Set(Object.keys(selectedById)), [selectedById])
  const selectedScans = useMemo(() => Object.values(selectedById), [selectedById])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setShareMessage(null)
    let startDate: string
    let endDate: string
    if (searchMode === 'single') {
      startDate = singleDate
      endDate = singleDate
    } else {
      if (rangeStart > rangeEnd) {
        setError('"From" must be on or before "To".')
        setLoading(false)
        setRows([])
        return
      }
      startDate = rangeStart
      endDate = rangeEnd
    }
    try {
      const params = new URLSearchParams({ startDate, endDate })
      const res = await fetch(`/api/insights/scans?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load scans')
      const data = await res.json()
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setSelectedById({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setRows([])
      setSelectedById({})
    } finally {
      setLoading(false)
    }
  }, [searchMode, singleDate, rangeStart, rangeEnd])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!previewScan) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewScan(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = original
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [previewScan])

  const hasAny = rows.some(
    (r) =>
      (r.depositScanUrls?.length ?? 0) > 0 ||
      (r.debitScanUrls?.length ?? 0) > 0 ||
      (r.securityScanUrls?.length ?? 0) > 0
  )

  const upsertSelection = useCallback((scan: SelectableScan) => {
    setSelectedById((prev) => {
      if (prev[scan.id]) {
        const next = { ...prev }
        delete next[scan.id]
        return next
      }
      return { ...prev, [scan.id]: scan }
    })
  }, [])

  const toggleSection = useCallback((scans: SelectableScan[]) => {
    setSelectedById((prev) => {
      const allSelected = scans.every((scan) => !!prev[scan.id])
      const next = { ...prev }
      if (allSelected) {
        for (const scan of scans) delete next[scan.id]
      } else {
        for (const scan of scans) next[scan.id] = scan
      }
      return next
    })
  }, [])

  const handleEmailShare = useCallback(async () => {
    const to = emailTo.trim()
    if (!to) {
      setShareMessage({ type: 'error', text: 'Enter one or more email addresses first.' })
      return
    }
    if (selectedScans.length === 0) {
      setShareMessage({ type: 'error', text: 'Select at least one scan to email.' })
      return
    }

    setSendingEmail(true)
    setShareMessage(null)
    try {
      const res = await fetch('/api/insights/scans/share/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, scans: selectedScans })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to send email')
      }
      setShareMessage({
        type: 'ok',
        text: `Sent ${selectedScans.length} scan${selectedScans.length === 1 ? '' : 's'} to ${to}.`
      })
    } catch (e) {
      setShareMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to send email' })
    } finally {
      setSendingEmail(false)
    }
  }, [emailTo, selectedScans])

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100/80 to-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Link
            href="/insights/expected-revenue"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
          >
            Expected revenue
          </Link>
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-semibold text-blue-900">
            Deposit & debit scans
          </span>
          <Link
            href="/financial/deposit-comparisons"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
          >
            Deposit comparisons
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Deposit & debit scans</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
          End-of-day deposit and debit scans grouped by <strong>calendar day</strong> (one section per day). Attachments
          from all shifts that day are merged; duplicate links appear once. Search a <strong>single day</strong> by
          default, or switch to a <strong>date range</strong> to browse multiple days. To mark each deposit line against
          the bank (pending, cleared, discrepancy), use{' '}
          <Link href="/financial/deposit-comparisons" className="font-medium text-blue-700 underline hover:text-blue-900">
            Deposit comparisons
          </Link>
          .
        </p>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSearchMode('single')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                searchMode === 'single'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              aria-pressed={searchMode === 'single'}
            >
              Single day
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('range')}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                searchMode === 'range'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              aria-pressed={searchMode === 'range'}
            >
              Date range
            </button>
          </div>

          {searchMode === 'single' ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-[220px]">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Day</label>
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
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
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-[200px]">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">From</label>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="min-w-0 flex-1 sm:max-w-[200px]">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">To</label>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
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
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Email to</label>
              <input
                type="text"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="ops@example.com, owner@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleEmailShare()}
              disabled={selectedScans.length === 0 || sendingEmail}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {sendingEmail ? 'Sending…' : `Email selected (${selectedScans.length})`}
            </button>
            <button
              type="button"
              disabled
              title="WhatsApp sharing coming soon"
              className="rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-500 cursor-not-allowed"
            >
              WhatsApp selected ({selectedScans.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedById({})}
              disabled={selectedScans.length === 0}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Select individual scans below, then send links by email. WhatsApp is shown as a placeholder for now.
          </p>
          {shareMessage && (
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                shareMessage.type === 'ok'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {shareMessage.text}
            </div>
          )}
        </div>

        {loading ? (
          <div className="mt-8">
            <p className="mb-4 text-sm text-gray-500">Loading scans…</p>
            <LoadingSkeleton />
          </div>
        ) : !hasAny ? (
          <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white/60 px-6 py-10 text-center text-gray-600 shadow-sm">
            <p className="font-medium text-gray-800">
              {searchMode === 'single' ? 'No scans for this day' : 'No scans in this range'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {searchMode === 'single'
                ? 'Pick another day or try a date range to search multiple days.'
                : 'Try widening the date range or pick different dates.'}
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {rows.map((row) => {
              const dep = (row.depositScanUrls?.length ? row.depositScanUrls : []).map((url) => ({
                id: buildScanId(row.date, 'deposit', url),
                date: row.date,
                kind: 'deposit' as const,
                url,
                label: scanLabelFromUrl(url)
              }))
              const deb = (row.debitScanUrls?.length ? row.debitScanUrls : []).map((url) => ({
                id: buildScanId(row.date, 'debit', url),
                date: row.date,
                kind: 'debit' as const,
                url,
                label: scanLabelFromUrl(url)
              }))
              const sec = (row.securityScanUrls?.length ? row.securityScanUrls : []).map((url) => ({
                id: buildScanId(row.date, 'security', url),
                date: row.date,
                kind: 'security' as const,
                url,
                label: scanLabelFromUrl(url)
              }))
              if (dep.length === 0 && deb.length === 0 && sec.length === 0) return null
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
                      <ScanLinkList
                        scans={dep}
                        label="Deposits"
                        accentClass="border-l-4 border-l-emerald-500"
                        allSelected={dep.every((scan) => selectedIds.has(scan.id))}
                        onToggleAll={() => toggleSection(dep)}
                        selectedIds={selectedIds}
                        onToggleOne={upsertSelection}
                        onPreview={setPreviewScan}
                      />
                    )}
                    {deb.length > 0 && (
                      <ScanLinkList
                        scans={deb}
                        label="Debits"
                        accentClass="border-l-4 border-l-amber-500"
                        allSelected={deb.every((scan) => selectedIds.has(scan.id))}
                        onToggleAll={() => toggleSection(deb)}
                        selectedIds={selectedIds}
                        onToggleOne={upsertSelection}
                        onPreview={setPreviewScan}
                      />
                    )}
                    {sec.length > 0 && (
                      <ScanLinkList
                        scans={sec}
                        label="Security"
                        accentClass="border-l-4 border-l-sky-500"
                        allSelected={sec.every((scan) => selectedIds.has(scan.id))}
                        onToggleAll={() => toggleSection(sec)}
                        selectedIds={selectedIds}
                        onToggleOne={upsertSelection}
                        onPreview={setPreviewScan}
                      />
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
      {previewScan && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewScan(null)}
        >
          <div
            className="flex h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-gray-900">{previewScan.label}</h3>
                <p className="text-xs text-gray-500">
                  {previewScan.date} · {previewScan.kind === 'deposit' ? 'Deposit' : previewScan.kind === 'debit' ? 'Debit' : 'Security'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewScan.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Open in new tab
                  <ExternalIcon className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewScan(null)}
                  className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 p-2 sm:p-3">
              <iframe
                src={pdfIframeSrc(previewScan.url)}
                title={previewScan.label}
                className="h-full w-full rounded-lg border border-gray-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
