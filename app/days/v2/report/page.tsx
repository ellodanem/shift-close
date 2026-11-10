'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { formatLitres, formatMoney } from '@/lib/day-reconcile'
import { buildRangeReport, type RangeReport } from '@/lib/day-range-report'
import { rangePresets } from '@/lib/day-range-presets'
import type { DayReportV2 } from '@/lib/day-reports-v2'

function dayLabel(ymd: string): { short: string; weekday: string } {
  const d = new Date(`${ymd}T12:00:00Z`)
  return {
    short: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    weekday: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  }
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${ok ? 'bg-green-600' : 'bg-red-600'}`} />
}

function osCell(n: number): string {
  return Math.abs(n) < 0.005 ? '-' : formatMoney(n, true)
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">{children}</h3>
}

const TH = 'px-2 py-1 font-normal'
const HEAD_ROW = 'border-b border-gray-200 text-xs text-gray-500'

/** `mini` keeps only the title, Collected and Deposit. */
function ReportView({ report, mini = false }: { report: RangeReport; mini?: boolean }) {
  const cash = report.cashChecks
  const range = `${report.from} to ${report.to}`
  return (
    <div className="rounded border border-gray-200 bg-white shadow-sm print:border-0 print:shadow-none">
      <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-bold text-gray-900">{report.from === report.to ? report.from : range}</span>
          <span className="text-sm text-gray-500">
            {report.dayCount} {report.dayCount === 1 ? 'day' : 'days'}
          </span>
        </div>
        <div className={`mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm ${mini ? 'hidden' : ''}`}>
          <span className={`font-semibold ${cash.status === 'differs' ? 'text-red-700' : 'text-green-800'}`}>
            <Dot ok={cash.status === 'match'} />
            Cash + Checks over/short {formatMoney(cash.overShort, true)}
          </span>
          <span className="text-gray-600">
            Counted <span className="font-semibold text-gray-800">{formatMoney(report.deposit.counted)}</span>
          </span>
          <span className="text-gray-600">
            Deposited <span className="font-semibold text-gray-800">{formatMoney(report.deposit.deposited)}</span>
          </span>
          {report.cstoreDayCount > 0 ? (
            <span className="text-gray-600">
              Total sales <span className="font-semibold text-gray-800">{formatMoney(report.sales.totalSales)}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="px-4 pb-6 pt-1 sm:px-6">
        {!mini && report.cstoreDayCount > 0 ? (
          <>
            <Heading>Sales</Heading>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={`${TH} text-left`}>Type</th>
                    <th className={`${TH} text-right`}>Cstore</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {report.sales.lines.map((l) => (
                    <tr key={l.key} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 text-left">{l.label}</td>
                      <td className="px-2 py-1.5 text-right">{formatMoney(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-gray-100 font-semibold">
                    <td className="px-2 py-1.5 text-left">Total sales</td>
                    <td className="px-2 py-1.5 text-right">{formatMoney(report.sales.totalSales)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Heading>Fuel sold (litres)</Heading>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={`${TH} text-left`}>Type</th>
                    <th className={`${TH} text-right`}>Cstore</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {report.fuel.map((l) => (
                    <tr key={l.key} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 text-left">{l.label}</td>
                      <td className="px-2 py-1.5 text-right">{formatLitres(l.litres)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <Heading>Collected</Heading>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH} text-left`}>Type</th>
                <th className={`${TH} text-right`}>System</th>
                <th className={`${TH} text-right`}>Count</th>
                <th className={`${TH} text-right`}>Over/Short</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.collected.map((l) => (
                <tr key={l.key} className={`border-b border-gray-100 ${l.key === 'cashChecks' ? 'font-semibold' : ''}`}>
                  <td className="px-2 py-1.5 text-left">
                    <Dot ok={l.status === 'match'} />
                    {l.label}
                  </td>
                  <td className="px-2 py-1.5 text-right">{formatMoney(l.system)}</td>
                  <td className="px-2 py-1.5 text-right">{formatMoney(l.count)}</td>
                  <td className="px-2 py-1.5 text-right">{osCell(l.overShort)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Over/Short is Count minus System, added up over the day&apos;s shifts as on the shift screen. Cash + Checks is
          the one that matters.
        </p>

        <Heading>Deposit</Heading>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH} text-left`}>Type</th>
                <th className={`${TH} text-right`}>Counted (Cash + Checks)</th>
                <th className={`${TH} text-right`}>Deposited</th>
                <th className={`${TH} text-right`}>Difference</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-b border-gray-100 font-semibold">
                <td className="px-2 py-1.5 text-left">
                  <Dot ok={report.deposit.status === 'match'} />
                  Deposit
                </td>
                <td className="px-2 py-1.5 text-right">{formatMoney(report.deposit.counted)}</td>
                <td className="px-2 py-1.5 text-right">{formatMoney(report.deposit.deposited)}</td>
                <td className="px-2 py-1.5 text-right">{osCell(report.deposit.diff)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {mini ? null : (
          <>
        <Heading>By day</Heading>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH} text-left`}>Day</th>
                <th className={`${TH} text-left`}>Verdict</th>
                <th className={`${TH} text-right`}>Cash + Checks</th>
                <th className={`${TH} text-right`}>Credit/Debit</th>
                <th className={`${TH} text-right`}>Deposit difference</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.byDay.map((d) => {
                const lbl = dayLabel(d.date)
                return (
                  <tr key={d.date} className="border-b border-gray-100">
                    <td className="px-2 py-1.5 text-left">
                      <Dot ok={d.differenceCount === 0} />
                      <Link href={`/days/v2?date=${d.date}`} className="text-blue-700 hover:underline">
                        {lbl.short}
                      </Link>{' '}
                      <span className="text-xs text-gray-500">{lbl.weekday}</span>
                    </td>
                    <td className="px-2 py-1.5 text-left text-gray-700">{d.verdictText}</td>
                    <td className="px-2 py-1.5 text-right">{osCell(d.cashOverShort)}</td>
                    <td className="px-2 py-1.5 text-right">{osCell(d.creditOverShort)}</td>
                    <td className="px-2 py-1.5 text-right">{osCell(d.depositDiff)}</td>
                  </tr>
                )
              })}
              <tr className="border-b border-gray-100 font-semibold">
                <td className="px-2 py-1.5 text-left">Range total</td>
                <td className="px-2 py-1.5" />
                <td className="px-2 py-1.5 text-right">{osCell(cash.overShort)}</td>
                <td className="px-2 py-1.5 text-right">
                  {osCell(report.collected.find((l) => l.key === 'credits')?.overShort ?? 0)}
                </td>
                <td className="px-2 py-1.5 text-right">{osCell(report.deposit.diff)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Heading>Notes</Heading>
        <div className="space-y-1 text-sm text-gray-600">
          {report.notes.length > 0 ? (
            report.notes.map((n, i) => <p key={i}>{n}</p>)
          ) : (
            <p>Nothing to flag.</p>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  )
}

function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}

function ReportPage() {
  const today = businessTodayYmd()
  const [from, setFrom] = useState(() => monthStartYmd(today))
  const [to, setTo] = useState(() => today)
  const [days, setDays] = useState<DayReportV2[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<RangeReport | null>(null)
  const [mini, setMini] = useState(false)
  const presets = useMemo(() => rangePresets(today), [today])
  // A quick range generates the report as soon as its days have loaded.
  const autoGenerate = useRef(false)

  const pickPreset = (p: { from: string; to: string }) => {
    if (p.from === from && p.to === to && !loading) {
      // Already showing these dates: tick every day again and generate.
      setSelected(new Set(days.map((d) => d.date)))
      setMini(false)
      setReport(days.length > 0 ? buildRangeReport(days) : null)
      return
    }
    autoGenerate.current = true
    setMini(false)
    setReport(null)
    setFrom(p.from)
    setTo(p.to)
  }

  const load = useCallback(() => {
    if (!from || !to || from > to) {
      setDays([])
      setSelected(new Set())
      return
    }
    setLoading(true)
    setError(null)
    fetch(`/api/days/v2?from=${from}&to=${to}`, { cache: 'no-store' })
      .then(async (res) => {
        const data: unknown = await res.json()
        if (!res.ok || !Array.isArray(data)) {
          setError('Could not load End of Day.')
          setDays([])
          setSelected(new Set())
          return
        }
        const list = (data as DayReportV2[])
          .filter((d) => d.date >= from && d.date <= to)
          .sort((a, b) => (a.date < b.date ? -1 : 1))
        setDays(list)
        setSelected(new Set(list.map((d) => d.date)))
        if (autoGenerate.current && list.length > 0) setReport(buildRangeReport(list))
      })
      .catch(() => {
        setError('Could not load End of Day.')
        setDays([])
        setSelected(new Set())
      })
      .finally(() => {
        autoGenerate.current = false
        setLoading(false)
      })
  }, [from, to])

  useEffect(() => {
    setReport(null)
    load()
  }, [load])

  const chosen = useMemo(() => days.filter((d) => selected.has(d.date)), [days, selected])

  const toggle = (date: string) => {
    setReport(null)
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl">
        <div className="print:hidden">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">End of Day report</h1>
            <Link href="/days/v2" className="ml-auto text-sm font-medium text-blue-700 hover:underline">
              Back to End of Day
            </Link>
          </div>
          <p className="mb-4 text-sm text-gray-600">Combine the days in a range into one statement.</p>

          <div className="mb-4 rounded border border-gray-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {presets.map((p) => {
                const active = from === p.from && to === p.to
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPreset(p)}
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
                <label className="mb-1 block text-xs text-gray-500" htmlFor="eod-report-from">
                  From
                </label>
                <input
                  id="eod-report-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500" htmlFor="eod-report-to">
                  To
                </label>
                <input
                  id="eod-report-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={loading || chosen.length === 0}
                onClick={() => {
                  setMini(false)
                  setReport(buildRangeReport(chosen))
                }}
                className="rounded bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                Generate
              </button>
              <button
                type="button"
                disabled={loading || chosen.length === 0}
                onClick={() => {
                  setMini(true)
                  setReport(buildRangeReport(chosen))
                }}
                className="rounded border border-gray-300 bg-white px-4 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Mini report
              </button>
              <button
                type="button"
                disabled={!report}
                onClick={() => window.print()}
                className="rounded border border-gray-300 bg-white px-4 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Print
              </button>
            </div>

            {loading ? (
              <p className="mt-3 text-sm text-gray-500">Loading…</p>
            ) : error ? (
              <p className="mt-3 text-sm text-red-700">{error}</p>
            ) : days.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No end of day records between these dates.</p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {days.map((d) => {
                    const on = selected.has(d.date)
                    const lbl = dayLabel(d.date)
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => toggle(d.date)}
                        aria-pressed={on}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                          on ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-300 bg-white text-gray-500'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded text-[11px] leading-none ${
                            on ? 'bg-gray-900 text-white' : 'border border-gray-300'
                          }`}
                        >
                          {on ? '\u2713' : ''}
                        </span>
                        {lbl.short} <span className="text-xs text-gray-400">{lbl.weekday}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Only days that have an End of Day can be included. Untick a day to leave it out.
                </p>
              </>
            )}
          </div>
        </div>

        {report ? <ReportView report={report} mini={mini} /> : null}
      </div>
    </div>
  )
}

export default function DaysV2ReportRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-500">Loading…</div>}>
      <ReportPage />
    </Suspense>
  )
}
