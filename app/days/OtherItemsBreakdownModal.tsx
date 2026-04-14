'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { pdfIframeSrc } from '@/lib/pdf-iframe-src'
import type { DayReport } from '@/lib/types'

function scanLabelFromUrl(url: string, index: number): string {
  try {
    const path = new URL(url, 'http://local.invalid').pathname
    const seg = path.split('/').filter(Boolean).pop()
    if (seg && seg.length > 0 && seg.length < 80) return decodeURIComponent(seg)
  } catch {
    /* ignore */
  }
  return `Other items scan ${index + 1}`
}

export default function OtherItemsBreakdownModal({
  date,
  dayReport,
  debitScanUrls,
  onClose
}: {
  date: string
  dayReport: DayReport
  debitScanUrls: string[]
  onClose: () => void
}) {
  const [compareScansOpen, setCompareScansOpen] = useState(false)
  const [activeScanIndex, setActiveScanIndex] = useState(0)

  const scans = useMemo(
    () => debitScanUrls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean),
    [debitScanUrls]
  )

  useEffect(() => {
    setActiveScanIndex((i) => (scans.length === 0 ? 0 : Math.min(i, scans.length - 1)))
  }, [scans.length])

  useEffect(() => {
    if (!compareScansOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (scans.length <= 1) return
      e.preventDefault()
      setActiveScanIndex((i) => {
        if (e.key === 'ArrowLeft') return i <= 0 ? scans.length - 1 : i - 1
        return i >= scans.length - 1 ? 0 : i + 1
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareScansOpen, scans.length])

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

  const activeScanUrl = scans[activeScanIndex] ?? null
  const activeScanTitle = activeScanUrl ? scanLabelFromUrl(activeScanUrl, activeScanIndex) : ''

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-3 sm:p-4">
      <div
        className={`bg-gray-50 rounded-lg shadow-xl w-full max-h-[min(92vh,900px)] border-2 border-gray-300 flex flex-col overflow-hidden ${
          compareScansOpen ? 'max-w-[min(96vw,1400px)]' : 'max-w-2xl'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="other-items-breakdown-modal-title"
      >
        <div className="shrink-0 bg-gray-50 border-b-2 border-gray-300 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 z-10">
          <div className="min-w-0">
            <h3 id="other-items-breakdown-modal-title" className="text-base sm:text-lg font-semibold text-gray-900">
              Other items — credit &amp; debit — {date}
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">
              Matches <span className="font-medium">Total Credit</span> and <span className="font-medium">Total Debit</span>{' '}
              in Money Summary (Other Items on the shift close).
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <button
              type="button"
              onClick={() => setCompareScansOpen((v) => !v)}
              className={`text-sm font-semibold rounded-lg border px-3 py-1.5 transition-colors ${
                compareScansOpen
                  ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700'
                  : 'border-violet-300 bg-white text-violet-800 hover:bg-violet-50'
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
            <div className="space-y-6">
              {dayReport.shifts.map((shift) => {
                const credit = Number.isFinite(shift.otherCredit) ? shift.otherCredit : 0
                const debit = Number.isFinite(shift.systemDebit) ? shift.systemDebit : 0
                const empty = credit === 0 && debit === 0
                return (
                  <div key={shift.id} className="border-b-2 border-gray-300 pb-4 last:border-b-0">
                    <div className="flex justify-between items-center mb-3 gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-900">{shift.shift} Shift</span>
                        <span className="ml-2 text-sm text-gray-600">• {shift.supervisor}</span>
                      </div>
                      {empty ? (
                        <span className="text-sm text-gray-400 shrink-0">No other items</span>
                      ) : null}
                    </div>
                    {!empty && (
                      <div className="ml-0 sm:ml-4 space-y-2">
                        <div className="flex justify-between items-center text-sm gap-3 rounded border border-purple-100 bg-purple-50/50 px-3 py-2">
                          <span className="text-gray-700 font-medium">Credit</span>
                          <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(credit)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm gap-3 rounded border border-blue-100 bg-blue-50/50 px-3 py-2">
                          <span className="text-gray-700 font-medium">Debit</span>
                          <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(debit)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-6 pt-4 border-t-2 border-gray-400 space-y-2">
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm font-semibold text-gray-800">Day total — Credit</span>
                <span className="text-lg font-bold text-gray-900 tabular-nums">
                  {formatCurrency(dayReport.totals.totalCredit)}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-sm font-semibold text-gray-800">Day total — Debit</span>
                <span className="text-lg font-bold text-gray-900 tabular-nums">
                  {formatCurrency(dayReport.totals.totalDebit)}
                </span>
              </div>
            </div>
          </div>

          {compareScansOpen && (
            <div className="min-h-0 flex flex-col bg-slate-100 border-t-2 border-gray-300 lg:border-t-0 lg:max-h-[min(85vh,820px)]">
              <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                  Credit &amp; debit scans (this day)
                </p>
                {scans.length === 0 ? (
                  <p className="text-sm text-slate-600 mt-1">
                    No scans uploaded for this date. Add them under Document scans → Credit &amp; debit on the End of Day
                    card.
                  </p>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {scans.map((url, i) => {
                        const label = scanLabelFromUrl(url, i)
                        const active = i === activeScanIndex
                        return (
                          <button
                            key={`${url}-${i}`}
                            type="button"
                            onClick={() => setActiveScanIndex(i)}
                            className={`max-w-full truncate rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? 'border-violet-600 bg-violet-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            title={label}
                          >
                            {scans.length > 1 ? `Scan ${i + 1}` : 'Scan'}
                          </button>
                        )
                      })}
                    </div>
                    {scans.length > 1 && (
                      <p className="text-[11px] text-slate-500 mt-1.5 hidden sm:block">
                        Tip: use ← → arrow keys to switch scans while this panel is open.
                      </p>
                    )}
                  </>
                )}
              </div>
              {scans.length > 0 && activeScanUrl && (
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
