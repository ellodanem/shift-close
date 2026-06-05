'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthContext'
import {
  addCalendarDaysYmd,
  businessTodayYmd,
  businessYesterdayYmd
} from '@/lib/datetime-policy'
import { MANAGER_HUB_PATH } from '@/lib/manager-hub'
import { pdfIframeSrc } from '@/lib/pdf-iframe-src'
import {
  SCANS_MOBILE_PATH,
  canAccessScansMobile,
  type ScanKind,
  type ScanTypeFilter
} from '@/lib/scans-mobile'
import {
  buildWhatsAppScanMessage,
  filterScansByType,
  formatScanDayHeading,
  kindLabel,
  openWhatsAppWithMessage,
  pickDefaultRecipientId,
  scansFromRow,
  type EmailRecipientOption,
  type SelectableScan
} from '@/lib/scan-share'

interface ScanRow {
  date: string
  depositScanUrls: string[]
  debitScanUrls: string[]
  securityScanUrls: string[]
}

type SearchMode = 'single' | 'range'

const KIND_FILTERS: { id: ScanTypeFilter; label: string }[] = [
  { id: 'debit', label: 'Debit' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'security', label: 'Security' },
  { id: 'all', label: 'All' }
]

const KIND_ACCENT: Record<ScanKind, string> = {
  debit: 'border-l-amber-500',
  deposit: 'border-l-emerald-500',
  security: 'border-l-sky-500'
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

function scansForRow(row: ScanRow, filter: ScanTypeFilter): SelectableScan[] {
  const all = [
    ...scansFromRow(row.date, 'deposit', row.depositScanUrls ?? []),
    ...scansFromRow(row.date, 'debit', row.debitScanUrls ?? []),
    ...scansFromRow(row.date, 'security', row.securityScanUrls ?? [])
  ]
  return filterScansByType(all, filter)
}

function groupScansByKind(scans: SelectableScan[]): { kind: ScanKind; scans: SelectableScan[] }[] {
  const order: ScanKind[] = ['debit', 'deposit', 'security']
  return order
    .map((kind) => ({ kind, scans: scans.filter((s) => s.kind === kind) }))
    .filter((g) => g.scans.length > 0)
}

export default function ScansMobilePage() {
  const router = useRouter()
  const { user, loading: authLoading, logout } = useAuth()
  const canView = user ? canAccessScansMobile(user.role) : false

  const todayIso = businessTodayYmd()
  const yesterdayIso = businessYesterdayYmd()

  const [searchMode, setSearchMode] = useState<SearchMode>('single')
  const [activeDate, setActiveDate] = useState(yesterdayIso)
  const [rangeStart, setRangeStart] = useState(addCalendarDaysYmd(todayIso, -6))
  const [rangeEnd, setRangeEnd] = useState(todayIso)
  const [kindFilter, setKindFilter] = useState<ScanTypeFilter>('debit')
  const [rows, setRows] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewScans, setPreviewScans] = useState<SelectableScan[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [pickerDate, setPickerDate] = useState(yesterdayIso)

  const [sendScans, setSendScans] = useState<SelectableScan[] | null>(null)
  const [recipients, setRecipients] = useState<EmailRecipientOption[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [otherEmail, setOtherEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const previewScan = previewScans[previewIndex] ?? null

  const searchLabel = useMemo(() => {
    if (searchMode === 'single') return formatScanDayHeading(activeDate)
    if (rangeStart === rangeEnd) return formatScanDayHeading(rangeStart)
    return `${formatScanDayHeading(rangeStart)} – ${formatScanDayHeading(rangeEnd)}`
  }, [searchMode, activeDate, rangeStart, rangeEnd])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let startDate: string
    let endDate: string
    if (searchMode === 'single') {
      startDate = activeDate
      endDate = activeDate
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [searchMode, activeDate, rangeStart, rangeEnd])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(SCANS_MOBILE_PATH)}`)
      return
    }
    if (!canView) router.replace('/dashboard')
  }, [authLoading, user, canView, router])

  useEffect(() => {
    if (!user || !canView) return
    void load()
  }, [user, canView, load])

  useEffect(() => {
    fetch('/api/email-recipients')
      .then((res) => res.json())
      .then((data) => {
        const list = (Array.isArray(data) ? data : []).map(
          (r: { id: string; label?: string; email?: string; mobileNumber?: string | null }) => ({
            id: String(r.id),
            label: r.label ?? '',
            email: r.email ?? '',
            mobileNumber: r.mobileNumber ?? null
          })
        )
        setRecipients(list)
        setRecipientId(pickDefaultRecipientId(list))
      })
      .catch(() => {
        setRecipients([])
        setRecipientId('')
      })
  }, [])

  useEffect(() => {
    if (!previewScan) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewScans([])
        setPreviewIndex(0)
      }
      if (e.key === 'ArrowLeft' && previewIndex > 0) setPreviewIndex((i) => i - 1)
      if (e.key === 'ArrowRight' && previewIndex < previewScans.length - 1) setPreviewIndex((i) => i + 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = original
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [previewScan, previewIndex, previewScans.length])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(id)
  }, [toast])

  const visibleRows = useMemo(() => {
    return rows
      .map((row) => ({ row, scans: scansForRow(row, kindFilter) }))
      .filter((entry) => entry.scans.length > 0)
  }, [rows, kindFilter])

  const pickSingleDay = (ymd: string) => {
    setSearchMode('single')
    setActiveDate(ymd)
  }

  const pickLastSevenDays = () => {
    setSearchMode('range')
    setRangeStart(addCalendarDaysYmd(todayIso, -6))
    setRangeEnd(todayIso)
  }

  const openPreview = (scans: SelectableScan[], index: number) => {
    setPreviewScans(scans)
    setPreviewIndex(index)
  }

  const openSendSheet = (scans: SelectableScan[]) => {
    if (scans.length === 0) {
      setToast({ type: 'error', text: 'No scans to send for this selection.' })
      return
    }
    setSendScans(scans)
    if (!recipientId && recipients.length > 0) {
      setRecipientId(pickDefaultRecipientId(recipients))
    }
  }

  const selectedRecipient = recipients.find((r) => r.id === recipientId)

  const resolveEmailTo = () => {
    const other = otherEmail.trim()
    if (other) return other
    if (recipientId && recipientId !== 'other') return selectedRecipient?.email?.trim() ?? ''
    return ''
  }

  const handleSendEmail = async () => {
    if (!sendScans?.length) return
    const to = resolveEmailTo()
    if (!to) {
      setToast({ type: 'error', text: 'Choose a recipient or enter an email address.' })
      return
    }
    setSendingEmail(true)
    try {
      const res = await fetch('/api/insights/scans/share/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, scans: sendScans })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to send email')
      }
      setSendScans(null)
      setToast({
        type: 'ok',
        text: `Sent ${sendScans.length} scan${sendScans.length === 1 ? '' : 's'} to ${to}.`
      })
    } catch (e) {
      setToast({ type: 'error', text: e instanceof Error ? e.message : 'Failed to send email' })
    } finally {
      setSendingEmail(false)
    }
  }

  const handleWhatsApp = (scans: SelectableScan[]) => {
    if (scans.length === 0) {
      setToast({ type: 'error', text: 'No scans to share.' })
      return
    }
    const message = buildWhatsAppScanMessage(scans)
    const phone =
      selectedRecipient?.mobileNumber ??
      recipients.find((r) => /owner|elcock/i.test(r.label))?.mobileNumber ??
      recipients[0]?.mobileNumber ??
      null
    openWhatsAppWithMessage(message, phone)
    if (!phone?.replace(/[^0-9]/g, '')) {
      setToast({ type: 'ok', text: 'Message copied. Paste into WhatsApp if needed.' })
    }
  }

  const chipClass = (active: boolean) =>
    `shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
      active
        ? 'bg-blue-600 text-white shadow-sm'
        : 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700'
    }`

  const isChipActive = (ymd: string) => searchMode === 'single' && activeDate === ymd
  const isRangeActive = searchMode === 'range' && rangeStart === addCalendarDaysYmd(todayIso, -6) && rangeEnd === todayIso

  if (authLoading || (!user && !error)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <p className="text-sm text-slate-300">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-safe">
      <header className="sticky top-0 z-20 border-b border-slate-700/80 bg-slate-900/95 backdrop-blur px-4 py-3">
        <div className="flex items-start justify-between gap-3 max-w-lg mx-auto">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link href={MANAGER_HUB_PATH} className="text-xs font-medium text-blue-300 hover:text-blue-200">
                ← Manager
              </Link>
            </div>
            <h1 className="text-lg font-semibold tracking-tight mt-0.5">Debit scans</h1>
            <p className="text-xs text-slate-400 mt-0.5 truncate" title={searchLabel}>
              {loading ? 'Loading…' : searchLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-xs font-medium text-slate-300 hover:text-white px-2 py-1 rounded-md hover:bg-slate-800 shrink-0"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-10 pt-4 space-y-4">
        <div className="-mx-1 overflow-x-auto pb-1">
          <div className="flex gap-2 min-w-max px-1">
            <button type="button" className={chipClass(isChipActive(todayIso))} onClick={() => pickSingleDay(todayIso)}>
              Today
            </button>
            <button
              type="button"
              className={chipClass(isChipActive(yesterdayIso))}
              onClick={() => pickSingleDay(yesterdayIso)}
            >
              Yesterday
            </button>
            <button
              type="button"
              className={chipClass(isChipActive(addCalendarDaysYmd(todayIso, -2)))}
              onClick={() => pickSingleDay(addCalendarDaysYmd(todayIso, -2))}
            >
              −2d
            </button>
            <button
              type="button"
              className={chipClass(isChipActive(addCalendarDaysYmd(todayIso, -3)))}
              onClick={() => pickSingleDay(addCalendarDaysYmd(todayIso, -3))}
            >
              −3d
            </button>
            <button type="button" className={chipClass(isRangeActive)} onClick={pickLastSevenDays}>
              Last 7 days
            </button>
            <button
              type="button"
              className={chipClass(datePickerOpen)}
              onClick={() => {
                setPickerDate(searchMode === 'single' ? activeDate : rangeEnd)
                setDatePickerOpen(true)
              }}
            >
              Pick date…
            </button>
          </div>
        </div>

        <div className="flex rounded-xl border border-slate-700 bg-slate-800/80 p-1 gap-1">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setKindFilter(f.id)}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                kindFilter === f.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-pressed={kindFilter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        {loading ? (
          <div className="space-y-4 animate-pulse" aria-hidden>
            {[0, 1].map((k) => (
              <div key={k} className="rounded-2xl border border-slate-700 bg-slate-800 h-36" />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-800/40 px-6 py-10 text-center">
            <p className="font-medium text-slate-200">
              No {kindFilter === 'all' ? '' : `${kindFilter} `}scans for this search
            </p>
            <p className="mt-2 text-sm text-slate-400">Try Yesterday or widen to Last 7 days.</p>
            <button
              type="button"
              onClick={() => pickSingleDay(yesterdayIso)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Show yesterday
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleRows.map(({ row, scans }) => {
              const groups = kindFilter === 'all' ? groupScansByKind(scans) : [{ kind: kindFilter as ScanKind, scans }]
              const actionLabel =
                kindFilter === 'debit'
                  ? 'debits'
                  : kindFilter === 'deposit'
                    ? 'deposits'
                    : kindFilter === 'security'
                      ? 'security scans'
                      : 'scans'
              return (
                <article key={row.date} className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden">
                  <div className="border-b border-slate-700/80 px-4 py-3">
                    <h2 className="text-base font-semibold text-white">{formatScanDayHeading(row.date)}</h2>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">{row.date}</p>
                  </div>
                  <div className="p-3 space-y-3">
                    {groups.map((group) => (
                      <div
                        key={group.kind}
                        className={`rounded-xl border border-slate-700/80 bg-slate-900/40 pl-3 pr-2 py-2 border-l-4 ${KIND_ACCENT[group.kind]}`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2 pl-0.5">
                          {kindLabel(group.kind)} ({group.scans.length})
                        </p>
                        <ul className="space-y-2">
                          {group.scans.map((scan, i) => {
                            const display =
                              scan.label.length > 48 ? `${scan.label.slice(0, 45)}…` : scan.label
                            return (
                              <li key={scan.id}>
                                <button
                                  type="button"
                                  onClick={() => openPreview(group.scans, i)}
                                  className="w-full flex items-center gap-3 rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-left text-sm active:bg-slate-700 min-h-[44px]"
                                >
                                  <PdfIcon className="shrink-0 text-red-400" />
                                  <span className="min-w-0 flex-1">
                                    <span className="font-medium text-slate-100 block truncate">{display}</span>
                                    <span className="text-[10px] text-slate-500">PDF · #{i + 1}</span>
                                  </span>
                                  <span className="text-slate-500 shrink-0" aria-hidden>
                                    →
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openSendSheet(scans)}
                        className="flex-1 rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white min-h-[44px] hover:bg-blue-500"
                      >
                        Email {actionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWhatsApp(scans)}
                        className="flex-1 rounded-xl border border-emerald-600/60 bg-emerald-950/40 px-3 py-3 text-sm font-semibold text-emerald-200 min-h-[44px] hover:bg-emerald-900/40"
                      >
                        WhatsApp
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      {toast ? (
        <div
          className={`fixed bottom-4 left-4 right-4 z-[130] mx-auto max-w-lg rounded-xl px-4 py-3 text-sm shadow-lg ${
            toast.type === 'ok'
              ? 'border border-emerald-500/40 bg-emerald-950 text-emerald-100'
              : 'border border-red-500/40 bg-red-950 text-red-100'
          }`}
          role="status"
        >
          {toast.text}
        </div>
      ) : null}

      {datePickerOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          onClick={() => setDatePickerOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl border border-slate-700 bg-slate-800 p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-white mb-3">Pick a day</h3>
            <input
              type="date"
              value={pickerDate}
              onChange={(e) => setPickerDate(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-sm text-slate-100"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  pickSingleDay(pickerDate)
                  setDatePickerOpen(false)
                }}
                className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white min-h-[44px]"
              >
                Search this day
              </button>
              <button
                type="button"
                onClick={() => setDatePickerOpen(false)}
                className="rounded-xl border border-slate-600 px-4 py-3 text-sm text-slate-300 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sendScans ? (
        <div
          className="fixed inset-0 z-[115] flex items-end justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          onClick={() => !sendingEmail && setSendScans(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl border border-slate-700 bg-slate-800 p-4 pb-8 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-white">Send to owner</h3>
            <p className="text-xs text-slate-400 mt-1">
              {sendScans.length} scan{sendScans.length === 1 ? '' : 's'} selected
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">To</label>
                {recipients.length > 0 ? (
                  <select
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-sm text-slate-100"
                  >
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} ({r.email})
                      </option>
                    ))}
                    <option value="other">Other email…</option>
                  </select>
                ) : null}
                {recipientId === 'other' || recipients.length === 0 ? (
                  <input
                    type="email"
                    value={otherEmail}
                    onChange={(e) => setOtherEmail(e.target.value)}
                    placeholder="owner@example.com"
                    className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-sm text-slate-100"
                  />
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Sending</p>
                <ul className="space-y-1 text-xs text-slate-300">
                  {sendScans.map((scan) => (
                    <li key={scan.id} className="truncate">
                      {kindLabel(scan.kind)} · {scan.date} · {scan.label}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => void handleSendEmail()}
                disabled={sendingEmail}
                className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white min-h-[48px] disabled:opacity-50"
              >
                {sendingEmail ? 'Sending…' : 'Send email'}
              </button>
              <button
                type="button"
                onClick={() => !sendingEmail && setSendScans(null)}
                disabled={sendingEmail}
                className="w-full py-2 text-sm text-slate-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewScan ? (
        <div className="fixed inset-0 z-[120] flex flex-col bg-slate-900" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setPreviewScans([])
                setPreviewIndex(0)
              }}
              className="text-sm font-semibold text-slate-300 px-2 py-1"
            >
              Close
            </button>
            <div className="min-w-0 flex-1 px-2 text-center">
              <p className="truncate text-sm font-semibold text-white">{previewScan.label}</p>
              <p className="text-[10px] text-slate-400">
                {previewScan.date} · {kindLabel(previewScan.kind)}
                {previewScans.length > 1 ? ` · ${previewIndex + 1} of ${previewScans.length}` : ''}
              </p>
            </div>
            <a
              href={previewScan.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-300 px-2 py-1 shrink-0"
            >
              Open
            </a>
          </div>

          {previewScans.length > 1 ? (
            <div className="flex justify-center gap-4 py-2 border-b border-slate-800 shrink-0">
              <button
                type="button"
                disabled={previewIndex <= 0}
                onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={previewIndex >= previewScans.length - 1}
                onClick={() => setPreviewIndex((i) => Math.min(previewScans.length - 1, i + 1))}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          ) : null}

          <div className="flex-1 min-h-0 bg-slate-950 p-2">
            <iframe
              src={pdfIframeSrc(previewScan.url)}
              title={previewScan.label}
              className="h-full w-full rounded-lg border border-slate-700 bg-white"
            />
          </div>

          <div className="shrink-0 border-t border-slate-700 p-3 flex gap-2 max-w-lg mx-auto w-full">
            <button
              type="button"
              onClick={() => openSendSheet([previewScan])}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white min-h-[44px]"
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => handleWhatsApp([previewScan])}
              className="flex-1 rounded-xl border border-emerald-600/60 bg-emerald-950/50 py-3 text-sm font-semibold text-emerald-200 min-h-[44px]"
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => openSendSheet(previewScans)}
              className="rounded-xl border border-slate-600 px-3 py-3 text-xs text-slate-300 min-h-[44px]"
              title="Email all scans in this group"
            >
              All
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
