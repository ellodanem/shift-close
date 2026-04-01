'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BankStatusGlyph,
  IconDebitCard,
  IconDepositSlip,
  IconFilter,
  IconLayers,
  IconMenu,
  IconSelect,
  IconShield
} from '@/app/components/IconDropdown'
import { formatCurrency } from '@/lib/format'

type BankStatus = 'pending' | 'cleared' | 'discrepancy'
type RecordKind = 'deposit' | 'debit'

interface Row {
  shiftId: string
  date: string
  shift: string
  supervisor: string
  recordKind: RecordKind
  lineIndex: number
  /** For debit rows: systemDebit + systemCredit (one scan often lists both). */
  amount: number
  systemDebit?: number
  systemCredit?: number
  /** True when this debit row sums all shifts that closed that calendar day (POS debit/credit is day-level). */
  debitDayAggregate?: boolean
  contributingShifts?: Array<{ shiftId: string; shift: string }>
  scanUrls: string[]
  securitySlipUrl: string | null
  bankStatus: BankStatus
  notes: string
}

interface Totals {
  count: number
  sumDeposits: number
  sumDebits: number
  pending: number
  cleared: number
  discrepancy: number
}

interface LoadMeta {
  shiftCount: number
  shiftTake: number
  truncated: boolean
  dateFiltered: boolean
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

function rowKey(r: Row): string {
  return `${r.shiftId}:${r.recordKind}:${r.lineIndex}`
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

type ScanOption = { url: string; label: string }

/** One entry per file; labels include shift so unnamed blob URLs are still distinguishable. */
function buildDepositScanOptions(deposits: Row[]): ScanOption[] {
  const seenShift = new Set<string>()
  const out: ScanOption[] = []
  for (const r of deposits) {
    if (seenShift.has(r.shiftId)) continue
    seenShift.add(r.shiftId)
    r.scanUrls.forEach((url, i) => {
      const name = scanLabelFromUrl(url)
      const short = name.length > 42 ? `${name.slice(0, 40)}…` : name
      out.push({
        url,
        label: `${r.shift} · ${r.scanUrls.length > 1 ? `file ${i + 1} · ` : ''}${short}`
      })
    })
  }
  return out
}

function buildDebitScanOptions(debits: Row[]): ScanOption[] {
  const out: ScanOption[] = []
  for (const r of debits) {
    r.scanUrls.forEach((url, i) => {
      const name = scanLabelFromUrl(url)
      const short = name.length > 36 ? `${name.slice(0, 34)}…` : name
      out.push({
        url,
        label: `${r.shift} · debit · ${r.scanUrls.length > 1 ? `file ${i + 1} · ` : ''}${short}`
      })
    })
  }
  return out
}

function buildSecurityScanOptions(deposits: Row[], debits: Row[]): ScanOption[] {
  const out: ScanOption[] = []
  for (const r of deposits) {
    if (!r.securitySlipUrl) continue
    out.push({
      url: r.securitySlipUrl,
      label: `${r.shift} · deposit line ${r.lineIndex + 1}`
    })
  }
  for (const r of debits) {
    if (!r.securitySlipUrl) continue
    out.push({
      url: r.securitySlipUrl,
      label: `${r.shift} · debit / credit`
    })
  }
  return out
}

function DayScanDropdowns({
  depositOptions,
  debitOptions,
  securityOptions,
  onOpenPreview
}: {
  depositOptions: ScanOption[]
  debitOptions: ScanOption[]
  securityOptions: ScanOption[]
  onOpenPreview: (url: string, label: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 py-3 bg-white border-b border-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Deposits</span>
        <IconMenu
          ariaLabel="Choose a deposit slip to preview"
          icon={<IconDepositSlip className="text-blue-700" />}
          triggerClassName="border-blue-200 bg-blue-50/90 hover:bg-blue-50 hover:border-blue-300"
          options={depositOptions.map((o) => ({ value: o.url, label: o.label }))}
          emptyHint="No deposit scans this day"
          onPick={(url, label) => onOpenPreview(url, label)}
        />
        {depositOptions.length === 0 ? (
          <span className="text-[11px] text-blue-600/75">No deposit scans this day</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Debits / credit</span>
        <IconMenu
          ariaLabel="Choose a debit or credit scan to preview"
          icon={<IconDebitCard className="text-violet-700" />}
          triggerClassName="border-violet-200 bg-violet-50/90 hover:bg-violet-50 hover:border-violet-300"
          options={debitOptions.map((o) => ({ value: o.url, label: o.label }))}
          emptyHint="No debit scans this day"
          onPick={(url, label) => onOpenPreview(url, label)}
        />
        {debitOptions.length === 0 ? (
          <span className="text-[11px] text-violet-600/75">No debit scans this day</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Security</span>
        <IconMenu
          ariaLabel="Choose a security slip to preview"
          icon={<IconShield className="text-emerald-700" />}
          triggerClassName="border-emerald-200 bg-emerald-50/90 hover:bg-emerald-50 hover:border-emerald-300"
          options={securityOptions.map((o) => ({ value: o.url, label: o.label }))}
          emptyHint="No security slips this day"
          onPick={(url, label) => onOpenPreview(url, label)}
        />
        {securityOptions.length === 0 ? (
          <span className="text-[11px] text-emerald-700/70">None uploaded yet (coming soon)</span>
        ) : null}
      </div>
    </div>
  )
}

function ScanPreviewModal({
  preview,
  onClose
}: {
  preview: { url: string; title: string } | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [preview, onClose])

  if (!preview) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-preview-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close preview"
      />
      <div className="relative z-10 flex w-full max-w-4xl max-h-[min(92vh,900px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 id="scan-preview-title" className="text-sm font-semibold text-slate-900 truncate pr-2" title={preview.title}>
            {preview.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="min-h-[50vh] flex-1 bg-slate-100">
          <iframe
            src={preview.url}
            className="h-[min(75vh,720px)] w-full border-0"
            title={preview.title}
          />
        </div>
        <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          Preview may not work for some hosts —{' '}
          <a href={preview.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
            Open in new tab
          </a>
        </div>
      </div>
    </div>
  )
}

const STATUS_OPTIONS: { value: BankStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'discrepancy', label: 'Discrepancy' }
]

const BANK_ROW_STATUS_OPTIONS: { value: BankStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'discrepancy', label: 'Discrepancy' }
]

const SHIFT_LIMIT_OPTIONS = [400, 600, 1200, 3000] as const

export default function DepositComparisonsPage() {
  const [hideCleared, setHideCleared] = useState(true)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]['value']>('all')
  const [useDateRange, setUseDateRange] = useState(false)
  const todayStr = useMemo(() => ymd(new Date()), [])
  const [from, setFrom] = useState(() => {
    const t = new Date()
    t.setMonth(t.getMonth() - 3)
    return ymd(t)
  })
  const [to, setTo] = useState(todayStr)
  const [shiftLimit, setShiftLimit] = useState<(typeof SHIFT_LIMIT_OPTIONS)[number]>(600)

  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [meta, setMeta] = useState<LoadMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [scanPreview, setScanPreview] = useState<{ url: string; title: string } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (useDateRange) {
        if (from) q.set('from', from)
        if (to) q.set('to', to)
      }
      if (statusFilter !== 'all') q.set('status', statusFilter)
      if (hideCleared) q.set('hideCleared', 'true')
      q.set('shiftLimit', String(shiftLimit))
      const res = await fetch(`/api/financial/deposit-comparisons?${q.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setTotals(data.totals ?? null)
      setMeta(data.meta ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setRows([])
      setTotals(null)
      setMeta(null)
    } finally {
      setLoading(false)
    }
  }, [from, to, statusFilter, hideCleared, shiftLimit, useDateRange])

  useEffect(() => {
    void load()
  }, [load])

  const byDate = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows) {
      if (!m.has(r.date)) m.set(r.date, [])
      m.get(r.date)!.push(r)
    }
    const dates = [...m.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    return dates.map((date) => ({
      date,
      deposits: (m.get(date) ?? []).filter((x) => x.recordKind === 'deposit'),
      debits: (m.get(date) ?? []).filter((x) => x.recordKind === 'debit')
    }))
  }, [rows])

  const patchRow = async (
    shiftId: string,
    recordKind: RecordKind,
    lineIndex: number,
    body: Partial<{ bankStatus: BankStatus; notes: string }>
  ) => {
    const key = `${shiftId}:${recordKind}:${lineIndex}`
    setSavingKey(key)
    setError(null)
    try {
      const res = await fetch('/api/financial/deposit-comparisons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, recordKind, lineIndex, ...body })
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

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <Link href="/financial/cashbook" className="font-medium text-blue-600 hover:text-blue-800">
              ← Cashbook
            </Link>
            <Link href="/insights/deposit-debit-scans" className="font-medium text-blue-600 hover:text-blue-800">
              Scans (Insights)
            </Link>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bank deposit & debit comparisons</h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Recent closed shifts first. Use the day&apos;s <strong>Deposits</strong>, <strong>Debits / credit</strong>, and{' '}
            <strong>Security</strong> icons to pick a scan and preview it in a modal (labeled by shift). Tables below are for amounts
            and bank status only.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-800">
              <input
                type="checkbox"
                checked={hideCleared}
                onChange={(e) => setHideCleared(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Hide cleared</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
              <IconSelect
                ariaLabel="Filter by bank status"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as (typeof STATUS_OPTIONS)[number]['value'])}
                options={STATUS_OPTIONS}
                renderTrigger={() => <IconFilter />}
              />
              <span className="text-sm text-slate-600" title="Current filter">
                {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'All'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Load</label>
              <IconSelect
                ariaLabel="Maximum shifts to load"
                value={String(shiftLimit)}
                onChange={(v) =>
                  setShiftLimit(parseInt(v, 10) as (typeof SHIFT_LIMIT_OPTIONS)[number])
                }
                options={SHIFT_LIMIT_OPTIONS.map((n) => ({
                  value: String(n),
                  label: `${n} shifts (max)`
                }))}
                renderTrigger={() => <IconLayers />}
              />
              <span className="text-sm text-slate-600" title="Shift load limit">
                {shiftLimit} shifts (max)
              </span>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="ml-auto rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Refresh
            </button>
          </div>

          <details className="group rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700 list-none flex items-center gap-2">
              <span className="text-slate-400 group-open:rotate-90 transition-transform">›</span>
              Filter by date (optional)
            </summary>
            <div className="mt-3 flex flex-wrap items-end gap-3 pl-5">
              <label className="flex items-center gap-2 text-sm mb-2 w-full sm:w-auto">
                <input
                  type="checkbox"
                  checked={useDateRange}
                  onChange={(e) => setUseDateRange(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Use date range
              </label>
              {useDateRange ? (
                <>
                  <div>
                    <span className="block text-xs text-slate-500 mb-1">From</span>
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500 mb-1">To</span>
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 mb-2">Showing the most recent shifts up to the limit above (newest days first).</p>
              )}
            </div>
          </details>
        </div>

        {meta?.truncated ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Loaded the maximum number of shifts ({meta.shiftTake}). Older history may be hidden — raise &quot;Load&quot; or
            narrow with a date filter.
          </p>
        ) : null}

        {totals && !loading ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1.5 font-medium tabular-nums">
              <span className="text-slate-500 mr-2">Items</span>
              {totals.count}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-800 px-3 py-1.5 tabular-nums">
              Pending {totals.pending}
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-900 border border-emerald-100 px-3 py-1.5 tabular-nums">
              Cleared {totals.cleared}
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-900 border border-amber-100 px-3 py-1.5 tabular-nums">
              Issue {totals.discrepancy}
            </span>
            <span className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1.5 text-slate-700 tabular-nums">
              Deposits Σ {formatCurrency(totals.sumDeposits)}
            </span>
            <span className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1.5 text-slate-700 tabular-nums">
              Debits Σ {formatCurrency(totals.sumDebits)}
            </span>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600 rounded-lg border border-red-100 bg-red-50 px-3 py-2">{error}</p> : null}

        <div className="space-y-8 pb-8">
          {loading ? (
            <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
          ) : byDate.length === 0 ? (
            <p className="text-sm text-slate-600 py-8 text-center rounded-xl border border-dashed border-slate-200 bg-white px-4">
              No items match your filters. Try turning off &quot;Hide cleared&quot;, widen the status filter, or load more shifts.
            </p>
          ) : (
            byDate.map(({ date, deposits, debits }) => {
              const depositScanOptions = buildDepositScanOptions(deposits)
              const debitScanOptions = buildDebitScanOptions(debits)
              const securityScanOptions = buildSecurityScanOptions(deposits, debits)
              return (
                <section key={date} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <header className="bg-slate-100/90 border-b border-slate-200 px-4 py-3">
                    <h2 className="text-base font-semibold text-slate-900">{formatDayHeading(date)}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {deposits.length} deposit line{deposits.length === 1 ? '' : 's'}
                      {debits.length ? ` · ${debits.length} debit${debits.length === 1 ? '' : 's'}` : ''}
                    </p>
                  </header>

                  <DayScanDropdowns
                    depositOptions={depositScanOptions}
                    debitOptions={debitScanOptions}
                    securityOptions={securityScanOptions}
                    onOpenPreview={(url, title) => setScanPreview({ url, title })}
                  />

                  <div className="divide-y divide-slate-100">
                    {deposits.length > 0 ? (
                      <div className="p-3 md:p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Deposits</h3>
                        <ItemTable rows={deposits} savingKey={savingKey} onPatch={patchRow} />
                      </div>
                    ) : null}
                    {debits.length > 0 ? (
                      <div className="p-3 md:p-4 bg-slate-50/50">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                          Debits (system debit + credit)
                        </h3>
                        <ItemTable rows={debits} savingKey={savingKey} onPatch={patchRow} />
                      </div>
                    ) : null}
                  </div>
                </section>
              )
            })
          )}
        </div>
      </div>

      <ScanPreviewModal preview={scanPreview} onClose={() => setScanPreview(null)} />
    </div>
  )
}

function ItemTable({
  rows,
  savingKey,
  onPatch
}: {
  rows: Row[]
  savingKey: string | null
  onPatch: (shiftId: string, recordKind: RecordKind, lineIndex: number, body: Partial<{ bankStatus: BankStatus; notes: string }>) => void
}) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
            <th className="px-2 py-2 pr-3">Shift</th>
            <th className="px-2 py-2">Who</th>
            <th className="px-2 py-2">Detail</th>
            <th className="px-2 py-2 text-right">Amount</th>
            <th className="px-2 py-2">Bank</th>
            <th className="px-2 py-2 min-w-[8rem]">Notes</th>
            <th className="px-2 py-2 whitespace-nowrap">Record</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r) => {
            const key = rowKey(r)
            const busy = savingKey === key
            return (
              <tr key={key} className="align-middle hover:bg-slate-50/80">
                <td className="px-2 py-2.5 text-slate-900 whitespace-nowrap font-medium">{r.shift}</td>
                <td className="px-2 py-2.5 text-slate-600 text-xs max-w-[8rem] truncate" title={r.supervisor}>
                  {r.supervisor}
                </td>
                <td className="px-2 py-2.5 text-slate-600 tabular-nums">
                  {r.recordKind === 'deposit' ? (
                    <span className="text-xs text-slate-500">Line #{r.lineIndex + 1}</span>
                  ) : (
                    <span
                      className="inline-flex rounded bg-violet-100 text-violet-900 text-[10px] font-bold px-1.5 py-0.5"
                      title="System debit + credit from POS; amount is the combined total (matches one slip)."
                    >
                      D + C
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-right text-slate-900">
                  {r.recordKind === 'debit' ? (
                    <>
                      <div className="text-[15px] font-bold tabular-nums text-[#4169E1]">
                        {formatCurrency(r.amount)}
                      </div>
                      <div className="mt-0.5 text-[11px] font-bold leading-tight tabular-nums text-[#4169E1]">
                        Debit {formatCurrency(r.systemDebit ?? 0)}
                        {' · '}
                        Credit {formatCurrency(r.systemCredit ?? 0)}
                      </div>
                    </>
                  ) : (
                    <div className="font-semibold tabular-nums">{formatCurrency(r.amount)}</div>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <IconSelect<BankStatus>
                    ariaLabel="Bank reconciliation status"
                    disabled={busy}
                    value={r.bankStatus}
                    onChange={(v) =>
                      void onPatch(r.shiftId, r.recordKind, r.lineIndex, { bankStatus: v })
                    }
                    options={BANK_ROW_STATUS_OPTIONS}
                    renderTrigger={({ value }) => <BankStatusGlyph status={value} />}
                  />
                </td>
                <td className="px-2 py-2.5">
                  <NotesCell
                    initial={r.notes}
                    disabled={busy}
                    onSave={(notes) => void onPatch(r.shiftId, r.recordKind, r.lineIndex, { notes })}
                  />
                </td>
                <td className="px-2 py-2.5">
                  {r.recordKind === 'debit' && r.debitDayAggregate && r.contributingShifts && r.contributingShifts.length > 1 ? (
                    <div className="flex flex-wrap gap-x-2 gap-y-1 max-w-[14rem]">
                      {r.contributingShifts.map((cs) => (
                        <Link
                          key={cs.shiftId}
                          href={`/shifts/${cs.shiftId}`}
                          className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                          title="Open shift record"
                        >
                          {cs.shift}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Link href={`/shifts/${r.shiftId}`} className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap">
                      Open shift
                    </Link>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initial) onSave(value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      placeholder="Ref, variance…"
      className="w-full min-w-[7rem] max-w-[14rem] rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400"
    />
  )
}
