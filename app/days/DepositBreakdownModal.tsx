'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { pdfIframeSrc } from '@/lib/pdf-iframe-src'
import type { DayReport } from '@/lib/types'
import type { DepositSlipSelection } from '@/lib/missing-deposit-slip-alert'

const DEBOUNCE_MS = 120_000

type AlertState = {
  open: boolean
  selections: DepositSlipSelection[]
  note: string
  firstNotifySentAt: string | null
  lastNotifySentAt: string | null
  lastEmailError: string | null
} | null

type DepositLineOption = {
  key: string
  shiftId: string
  lineIndex: number
  amount: number
  shift: string
  supervisor: string
}

function buildDepositLineOptions(dayReport: DayReport): DepositLineOption[] {
  const out: DepositLineOption[] = []
  for (const shift of dayReport.shifts) {
    const deposits = Array.isArray(shift.deposits) ? shift.deposits : []
    deposits.forEach((amt: number, index: number) => {
      if (amt > 0) {
        out.push({
          key: `${shift.id}:${index}`,
          shiftId: shift.id,
          lineIndex: index,
          amount: amt,
          shift: shift.shift,
          supervisor: shift.supervisor
        })
      }
    })
  }
  return out
}

function scanLabelFromUrl(url: string, index: number): string {
  try {
    const path = new URL(url, 'http://local.invalid').pathname
    const seg = path.split('/').filter(Boolean).pop()
    if (seg && seg.length > 0 && seg.length < 80) return decodeURIComponent(seg)
  } catch {
    /* ignore */
  }
  return `Deposit scan ${index + 1}`
}

export default function DepositBreakdownModal({
  date,
  dayReport,
  depositScanUrls,
  onClose,
  onSaved
}: {
  date: string
  dayReport: DayReport
  depositScanUrls: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState<AlertState>(null)
  const [flagOpen, setFlagOpen] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const [notifyQueuedUntil, setNotifyQueuedUntil] = useState<number | null>(null)
  const [notifySending, setNotifySending] = useState(false)
  /** Collapsible “missing slip” panel — collapsed by default for a cleaner modal. */
  const [missingSlipPanelExpanded, setMissingSlipPanelExpanded] = useState(false)
  /** Side-by-side deposit slip preview (same calendar day). */
  const [compareScansOpen, setCompareScansOpen] = useState(false)
  const [activeScanIndex, setActiveScanIndex] = useState(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [, setTick] = useState(0)

  const lineOptions = useMemo(() => buildDepositLineOptions(dayReport), [dayReport])

  const depositScans = useMemo(
    () => depositScanUrls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean),
    [depositScanUrls]
  )

  useEffect(() => {
    setActiveScanIndex((i) => (depositScans.length === 0 ? 0 : Math.min(i, depositScans.length - 1)))
  }, [depositScans.length])

  useEffect(() => {
    if (!compareScansOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (depositScans.length <= 1) return
      e.preventDefault()
      setActiveScanIndex((i) => {
        if (e.key === 'ArrowLeft') return i <= 0 ? depositScans.length - 1 : i - 1
        return i >= depositScans.length - 1 ? 0 : i + 1
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareScansOpen, depositScans.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (compareScansOpen) {
        setCompareScansOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareScansOpen, onClose])

  const loadAlert = useCallback(async () => {
    setLoading(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/days/${encodeURIComponent(date)}/missing-deposit-slip`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load alert')
      const a = data.alert as AlertState
      setAlert(a)
      if (a) {
        setFlagOpen(a.open)
        setNote(a.note ?? '')
        const keys = new Set<string>()
        for (const s of a.selections ?? []) {
          keys.add(`${s.shiftId}:${s.lineIndex}`)
        }
        setSelectedKeys(keys)
        setNotifyError(a.lastEmailError)
      } else {
        setFlagOpen(false)
        setNote('')
        setSelectedKeys(new Set())
        setNotifyError(null)
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void loadAlert()
  }, [loadAlert])

  const clearDebounce = () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    setNotifyQueuedUntil(null)
  }

  const scheduleDebouncedNotify = () => {
    clearDebounce()
    const until = Date.now() + DEBOUNCE_MS
    setNotifyQueuedUntil(until)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      setNotifyQueuedUntil(null)
      void sendNotify(false)
    }, DEBOUNCE_MS)
  }

  useEffect(() => {
    if (notifyQueuedUntil === null) {
      if (tickTimer.current) {
        clearInterval(tickTimer.current)
        tickTimer.current = null
      }
      return
    }
    tickTimer.current = setInterval(() => setTick((t) => t + 1), 1000)
    return () => {
      if (tickTimer.current) clearInterval(tickTimer.current)
    }
  }, [notifyQueuedUntil])

  useEffect(() => {
    return () => {
      clearDebounce()
    }
  }, [])

  const selectionsFromKeys = (): DepositSlipSelection[] => {
    const out: DepositSlipSelection[] = []
    for (const opt of lineOptions) {
      if (selectedKeys.has(opt.key)) {
        out.push({ shiftId: opt.shiftId, lineIndex: opt.lineIndex, amount: opt.amount })
      }
    }
    return out
  }

  const saveAlert = async (): Promise<boolean> => {
    setSaving(true)
    setSaveError(null)
    setNotifyError(null)
    try {
      const selections = selectionsFromKeys()
      const res = await fetch(`/api/days/${encodeURIComponent(date)}/missing-deposit-slip`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: flagOpen, selections, note })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Save failed')
      const a = data.alert as NonNullable<AlertState>
      setAlert(a)
      setNotifyError(a.lastEmailError)
      onSaved()
      if (a.open && selections.length > 0) {
        scheduleDebouncedNotify()
      } else {
        clearDebounce()
      }
      return true
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }

  const sendNotify = async (force: boolean) => {
    setNotifySending(true)
    setNotifyError(null)
    try {
      const res = await fetch(`/api/days/${encodeURIComponent(date)}/missing-deposit-slip/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      })
      const data = await res.json()
      if (data.skipped && data.reason === 'already_notified_for_state') {
        return
      }
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Notification failed')
      }
      await loadAlert()
      onSaved()
    } catch (e) {
      setNotifyError(e instanceof Error ? e.message : 'Notification failed')
      await loadAlert()
    } finally {
      setNotifySending(false)
    }
  }

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const secondsLeft =
    notifyQueuedUntil !== null ? Math.max(0, Math.ceil((notifyQueuedUntil - Date.now()) / 1000)) : 0

  const activeScanUrl = depositScans[activeScanIndex] ?? null
  const activeScanTitle = activeScanUrl ? scanLabelFromUrl(activeScanUrl, activeScanIndex) : ''

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-3 sm:p-4">
      <div
        className={`bg-gray-50 rounded-lg shadow-xl w-full max-h-[min(92vh,900px)] border-2 border-gray-300 flex flex-col overflow-hidden ${
          compareScansOpen ? 'max-w-[min(96vw,1400px)]' : 'max-w-2xl'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-breakdown-modal-title"
      >
        <div className="shrink-0 bg-gray-50 border-b-2 border-gray-300 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 z-10">
          <h3 id="deposit-breakdown-modal-title" className="text-base sm:text-lg font-semibold text-gray-900 min-w-0">
            Deposit Breakdown — {date}
          </h3>
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <button
              type="button"
              onClick={() => setCompareScansOpen((v) => !v)}
              className={`text-sm font-semibold rounded-lg border px-3 py-1.5 transition-colors ${
                compareScansOpen
                  ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                  : 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50'
              }`}
              aria-pressed={compareScansOpen}
            >
              {compareScansOpen ? 'Hide scans' : 'Compare scans'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none px-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div
          className={`flex-1 min-h-0 grid ${compareScansOpen ? 'grid-cols-1 lg:grid-cols-2 lg:divide-x-2 lg:divide-gray-300' : 'grid-cols-1'}`}
        >
          <div className={`min-h-0 overflow-y-auto p-4 sm:p-6 ${compareScansOpen ? 'lg:max-h-[min(85vh,820px)]' : ''}`}>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              <div className="space-y-6">
                {dayReport.shifts.map((shift) => {
                  const deposits = Array.isArray(shift.deposits) ? shift.deposits : []
                  const hasDeposits = deposits.length > 0 && deposits.some((d: number) => d > 0)

                  if (!hasDeposits) {
                    return (
                      <div key={shift.id} className="border-b-2 border-gray-300 pb-4">
                        <div className="flex justify-between items-center mb-2">
                          <div>
                            <span className="font-semibold text-gray-900">{shift.shift} Shift</span>
                            <span className="ml-2 text-sm text-gray-600">• {shift.supervisor}</span>
                          </div>
                          <span className="text-sm text-gray-400">No deposits</span>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={shift.id} className="border-b-2 border-gray-300 pb-4 last:border-b-0">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <span className="font-semibold text-gray-900">{shift.shift} Shift</span>
                          <span className="ml-2 text-sm text-gray-600">• {shift.supervisor}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-700">
                          Subtotal: {formatCurrency(shift.totalDeposits || 0)}
                        </span>
                      </div>
                      <div className="ml-4 space-y-1">
                        {deposits.map((deposit: number, index: number) => {
                          if (deposit <= 0) return null
                          const key = `${shift.id}:${index}`
                          const checked = selectedKeys.has(key)
                          return (
                            <label
                              key={index}
                              className={`flex justify-between items-center text-sm gap-3 rounded px-1 py-0.5 -mx-1 cursor-pointer ${checked ? 'bg-amber-50' : ''}`}
                            >
                              <span className="text-gray-600 flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300 flex-shrink-0"
                                  checked={checked}
                                  onChange={() => toggleKey(key)}
                                />
                                <span>Deposit {index + 1}:</span>
                              </span>
                              <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(deposit)}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-6 pt-4 border-t-2 border-amber-200 bg-amber-50/60 rounded-lg overflow-hidden">
                <button
                  type="button"
                  id="missing-slip-panel-trigger"
                  aria-expanded={missingSlipPanelExpanded}
                  aria-controls="missing-slip-panel-body"
                  onClick={() => setMissingSlipPanelExpanded((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-100/50 transition-colors"
                >
                  <div className="min-w-0">
                    <h4 className="font-semibold text-amber-950 text-sm">
                      Missing deposit slip scan (this calendar day)
                    </h4>
                    {!missingSlipPanelExpanded && (
                      <p className="text-[11px] text-amber-900/80 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {flagOpen && <span className="font-medium">Flag open</span>}
                        {selectedKeys.size > 0 && (
                          <span>
                            {selectedKeys.size} line{selectedKeys.size === 1 ? '' : 's'} selected
                          </span>
                        )}
                        {notifyQueuedUntil !== null && flagOpen && selectedKeys.size > 0 && (
                          <span>Email queued (~{Math.ceil(secondsLeft / 60)}m)</span>
                        )}
                        {(notifyError || alert?.lastEmailError) && (
                          <span className="text-red-700 font-medium">Send failed — expand to retry</span>
                        )}
                        {saveError && <span className="text-red-700 font-medium">Save error — expand</span>}
                        {!flagOpen &&
                          selectedKeys.size === 0 &&
                          !(notifyError || alert?.lastEmailError) &&
                          !saveError && (
                            <span className="text-amber-800/70">Optional — expand to configure</span>
                          )}
                      </p>
                    )}
                  </div>
                  <span
                    className="text-amber-800/80 text-sm flex-shrink-0 tabular-nums w-6 text-center"
                    aria-hidden
                  >
                    {missingSlipPanelExpanded ? '▼' : '▶'}
                  </span>
                </button>

                {missingSlipPanelExpanded && (
                  <div id="missing-slip-panel-body" className="px-4 pb-4 pt-0 space-y-3 border-t border-amber-200/80">
                    <p className="text-xs text-amber-900/90 pt-3">
                      Select the deposit line(s) above that are missing a scanned slip. Saving sends a notification email
                      to your configured list after a {DEBOUNCE_MS / 1000}-second quiet period (unless you change the
                      alert again). Use Send now to skip the wait, or Retry after a failed send.
                    </p>
                    <label className="flex items-center gap-2 text-sm text-amber-950">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={flagOpen}
                        onChange={(e) => setFlagOpen(e.target.checked)}
                      />
                      Flag open — missing scan(s) for selected deposit amount(s)
                    </label>
                    <div>
                      <label className="block text-xs font-medium text-amber-950 mb-1">Optional note</label>
                      <textarea
                        className="w-full border border-amber-200 rounded px-2 py-1.5 text-sm"
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. will upload after bank confirms"
                      />
                    </div>
                    {saveError && <p className="text-sm text-red-700">{saveError}</p>}
                    {(notifyError || alert?.lastEmailError) && (
                      <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        <p className="font-semibold">Last notification failed</p>
                        <p className="mt-1">{notifyError || alert?.lastEmailError}</p>
                        <button
                          type="button"
                          className="mt-2 text-sm font-semibold text-red-900 underline"
                          disabled={notifySending}
                          onClick={() => void sendNotify(true)}
                        >
                          Retry send
                        </button>
                      </div>
                    )}
                    {notifyQueuedUntil !== null && flagOpen && selectedKeys.size > 0 && (
                      <p className="text-xs text-amber-900">
                        Email queued: sends in ~{Math.floor(secondsLeft / 60)}:
                        {String(secondsLeft % 60).padStart(2, '0')} unless you save again.
                      </p>
                    )}
                    {alert?.firstNotifySentAt && (
                      <p className="text-[11px] text-amber-800/90">
                        First notified: {new Date(alert.firstNotifySentAt).toLocaleString()}
                        {alert.lastNotifySentAt
                          ? ` · Last sent: ${new Date(alert.lastNotifySentAt).toLocaleString()}`
                          : ''}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void saveAlert()}
                        className="px-4 py-2 bg-amber-700 text-white rounded text-sm font-semibold hover:bg-amber-800 disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save alert'}
                      </button>
                      <button
                        type="button"
                        disabled={notifySending || !flagOpen || selectedKeys.size === 0}
                        onClick={() => {
                          clearDebounce()
                          void sendNotify(false)
                        }}
                        className="px-4 py-2 bg-white border border-amber-700 text-amber-900 rounded text-sm font-semibold hover:bg-amber-100 disabled:opacity-50"
                      >
                        {notifySending ? 'Sending…' : 'Send notification now'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t-2 border-gray-400">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Grand Total:</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(dayReport.totals.totalDeposits)}</span>
                </div>
              </div>
            </>
          )}
          </div>

          {compareScansOpen && (
            <div className="min-h-0 flex flex-col bg-slate-100 border-t-2 border-gray-300 lg:border-t-0 lg:max-h-[min(85vh,820px)]">
              <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Deposit scans (this day)</p>
                {depositScans.length === 0 ? (
                  <p className="text-sm text-slate-600 mt-1">
                    No deposit scans uploaded for this date. Add them under Document scans on the End of Day card.
                  </p>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {depositScans.map((url, i) => {
                        const label = scanLabelFromUrl(url, i)
                        const active = i === activeScanIndex
                        return (
                          <button
                            key={`${url}-${i}`}
                            type="button"
                            onClick={() => setActiveScanIndex(i)}
                            className={`max-w-full truncate rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            title={label}
                          >
                            {depositScans.length > 1 ? `Scan ${i + 1}` : 'Scan'}
                          </button>
                        )
                      })}
                    </div>
                    {depositScans.length > 1 && (
                      <p className="text-[11px] text-slate-500 mt-1.5 hidden sm:block">
                        Tip: use ← → arrow keys to switch scans while this panel is open.
                      </p>
                    )}
                  </>
                )}
              </div>
              {depositScans.length > 0 && activeScanUrl && (
                <div className="flex-1 min-h-[min(50vh,480px)] flex flex-col min-w-0">
                  <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-white/80 border-b border-slate-200 sm:px-4">
                    <span className="text-xs font-medium text-slate-800 truncate pr-2" title={activeScanTitle}>
                      {activeScanTitle}
                    </span>
                    <a
                      href={activeScanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Open in new tab
                    </a>
                  </div>
                  <div className="flex-1 min-h-[280px] bg-slate-200/80">
                    <iframe
                      src={pdfIframeSrc(activeScanUrl)}
                      className="h-full w-full min-h-[280px] border-0"
                      title={activeScanTitle}
                    />
                  </div>
                  <p className="shrink-0 text-[11px] text-slate-600 px-3 py-2 bg-slate-50 border-t border-slate-200 sm:px-4">
                    Preview may not work for some hosts — use Open in new tab if the frame is blank.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
