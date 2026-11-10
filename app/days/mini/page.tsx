'use client'

import { useCallback, useMemo, useState } from 'react'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { rangePresets } from '@/lib/day-range-presets'
import type { MiniRangeReport } from '@/lib/mini-report'
import MiniRangeReportView from '../MiniRangeReportView'

async function downloadPdf(report: MiniRangeReport) {
  const { downloadMiniReportPdf } = await import('@/lib/mini-report-pdf')
  downloadMiniReportPdf(report)
}

function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}

/** Mini report page: pick a range, generate, print. Collected and Deposit only. */
export default function MiniReportPage() {
  const today = businessTodayYmd()
  const presets = useMemo(() => rangePresets(today), [today])
  const [from, setFrom] = useState(() => monthStartYmd(today))
  const [to, setTo] = useState(() => today)
  const [report, setReport] = useState<MiniRangeReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const generate = useCallback(async (f: string, t: string) => {
    if (!f || !t || f > t) {
      setReport(null)
      setMessage('Pick a start date on or before the end date.')
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/days/mini?from=${f}&to=${t}`, { cache: 'no-store' })
      const data = (await res.json().catch(() => null)) as { report?: MiniRangeReport | null } | null
      if (!res.ok || !data) {
        setReport(null)
        setMessage('Could not build the report.')
      } else if (!data.report) {
        setReport(null)
        setMessage('No end of day records between these dates.')
      } else {
        setReport(data.report)
      }
    } catch {
      setReport(null)
      setMessage('Could not build the report.')
    } finally {
      setLoading(false)
    }
  }, [])

  const pick = (p: { from: string; to: string }) => {
    setFrom(p.from)
    setTo(p.to)
    void generate(p.from, p.to)
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="print:hidden">
          <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">Mini report</h1>
          <p className="mb-4 text-sm text-gray-600">What was collected and deposited over a range of days.</p>

          <div className="mb-4 rounded border border-gray-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {presets.map((p) => {
                const active = from === p.from && to === p.to
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pick(p)}
                    aria-pressed={active}
                    className={`rounded px-3 py-1.5 text-sm font-semibold ${
                      active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500" htmlFor="mini-from">
                  From
                </label>
                <input
                  id="mini-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500" htmlFor="mini-to">
                  To
                </label>
                <input
                  id="mini-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void generate(from, to)}
                className="rounded bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                Generate
              </button>
              <button
                type="button"
                disabled={!report}
                onClick={() => window.print()}
                className="rounded border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Print
              </button>
              <button
                type="button"
                disabled={!report}
                onClick={() => report && void downloadPdf(report)}
                className="rounded border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                PDF
              </button>
            </div>
            {loading ? <p className="mt-3 text-sm text-gray-500">Loading…</p> : null}
            {message ? <p className="mt-3 text-sm text-gray-600">{message}</p> : null}
          </div>
        </div>

        {report ? <MiniRangeReportView report={report} /> : null}
      </div>
    </div>
  )
}
