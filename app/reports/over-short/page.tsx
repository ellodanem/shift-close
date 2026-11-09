'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { addCalendarDaysYmd, businessTodayYmd, isYmd } from '@/lib/datetime-policy'
import { OVER_SHORT_LOOK_THRESHOLD } from '@/lib/day-reconcile'
import { signedMoney, type OverShortReport } from '@/lib/over-short-report'

const EMAIL_STORAGE_KEY = 'over-short-report-email-to'

function amountClass(n: number): string {
  if (Math.abs(n) < 0.005) return 'text-gray-500'
  return n < 0 ? 'text-red-700' : 'text-emerald-700'
}

function defaultRange(): { from: string; to: string } {
  const to = addCalendarDaysYmd(businessTodayYmd(), -1)
  return { from: addCalendarDaysYmd(to, -6), to }
}

function OverShortReportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramFrom = searchParams.get('from') ?? ''
  const paramTo = searchParams.get('to') ?? ''
  const initial = isYmd(paramFrom) && isYmd(paramTo) ? { from: paramFrom, to: paramTo } : defaultRange()

  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [report, setReport] = useState<OverShortReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [recipients, setRecipients] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    try {
      setRecipients(window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? '')
    } catch {
      /* storage can be unavailable; the field just starts empty */
    }
  }, [])

  const load = useCallback(async () => {
    if (!isYmd(from) || !isYmd(to)) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/over-short?from=${from}&to=${to}`, { cache: 'no-store' })
      const data: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        setReport(null)
        setError((data as { error?: string }).error || 'Could not load the report.')
        return
      }
      setReport(data as OverShortReport)
    } catch {
      setReport(null)
      setError('Could not load the report.')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const applyRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom)
    setTo(nextTo)
    setSendResult(null)
    router.replace(`/reports/over-short?from=${nextFrom}&to=${nextTo}`, { scroll: false })
  }

  const lastDays = (days: number) => {
    const end = addCalendarDaysYmd(businessTodayYmd(), -1)
    applyRange(addCalendarDaysYmd(end, -(days - 1)), end)
  }

  const sendEmail = async () => {
    setSendResult(null)
    if (!recipients.trim()) {
      setSendResult({ ok: false, text: 'Enter an email address to send to.' })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/reports/over-short/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, recipients })
      })
      const data: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSendResult({ ok: false, text: (data as { error?: string }).error || 'Could not send the email.' })
        return
      }
      try {
        window.localStorage.setItem(EMAIL_STORAGE_KEY, recipients.trim())
      } catch {
        /* not saving the address is fine */
      }
      const sentTo = (data as { sentTo?: string[] }).sentTo ?? []
      setSendResult({ ok: true, text: `Sent to ${sentTo.join(', ')}.` })
    } catch {
      setSendResult({ ok: false, text: 'Could not send the email.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-full bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-blue-950">Over/short report</h1>
        <p className="mt-1 text-sm text-gray-600">
          Cash + Checks and Credit/Debit are the count minus the system, so a minus means money is missing.
          Deposited vs counted is the bank deposit minus the cash and checks counted.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => e.target.value && applyRange(e.target.value, to)}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">To</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => e.target.value && applyRange(from, e.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          {[7, 14, 30].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => lastDays(days)}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
            >
              Last {days} days
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        ) : loading && !report ? (
          <div className="mt-4 rounded border border-gray-200 bg-white p-8 text-center text-gray-500">Loading…</div>
        ) : report ? (
          <>
            <section className="mt-4 rounded border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-gray-900">By day</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="px-2 py-1 text-left font-normal">Day</th>
                      <th className="px-2 py-1 text-right font-normal">Shifts</th>
                      <th className="px-2 py-1 text-right font-normal">Cash + Checks</th>
                      <th className="px-2 py-1 text-right font-normal">Credit/Debit</th>
                      <th className="px-2 py-1 text-right font-normal">Deposited vs counted</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {report.rows.map((r) => (
                      <tr key={r.date} className="border-b border-gray-100">
                        <td className="px-2 py-1.5 text-left">
                          <span
                            aria-hidden
                            className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${
                              r.flagged ? 'bg-red-600' : 'bg-green-600'
                            }`}
                          />
                          <span className="sr-only">{r.flagged ? 'Needs a look: ' : 'Balanced: '}</span>
                          {r.dayLabel} <span className="text-xs text-gray-500">{r.weekday}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-700">{r.shifts}</td>
                        <td className={`px-2 py-1.5 text-right ${amountClass(r.cashChecks)}`}>
                          {signedMoney(r.cashChecks)}
                        </td>
                        <td className={`px-2 py-1.5 text-right ${amountClass(r.creditDebit)}`}>
                          {signedMoney(r.creditDebit)}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right ${
                            Math.abs(r.depositDiff) > OVER_SHORT_LOOK_THRESHOLD
                              ? amountClass(r.depositDiff)
                              : 'text-gray-700'
                          }`}
                        >
                          {signedMoney(r.depositDiff)}
                        </td>
                      </tr>
                    ))}
                    {report.rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-6 text-center text-gray-500">
                          No closed shifts in this range. Pick other dates.
                        </td>
                      </tr>
                    ) : (
                      <tr className="font-semibold">
                        <td className="px-2 py-2 text-left">Range total</td>
                        <td className="px-2 py-2" />
                        <td className={`px-2 py-2 text-right ${amountClass(report.totals.cashChecks)}`}>
                          {signedMoney(report.totals.cashChecks)}
                        </td>
                        <td className={`px-2 py-2 text-right ${amountClass(report.totals.creditDebit)}`}>
                          {signedMoney(report.totals.creditDebit)}
                        </td>
                        <td className="px-2 py-2 text-right text-gray-900">{signedMoney(report.totals.depositDiff)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h2 className="mb-1 mt-5 text-sm font-semibold text-gray-900">Notes</h2>
              <div className="space-y-1 text-sm text-gray-700">
                {report.notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-gray-900">Email this report</h2>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[240px] flex-1 text-sm text-gray-700">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Send to
                  </span>
                  <input
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    value={recipients}
                    onChange={(e) => {
                      setRecipients(e.target.value)
                      setSendResult(null)
                    }}
                    placeholder="name@example.com, second@example.com"
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void sendEmail()}
                  disabled={sending || report.rows.length === 0}
                  className="rounded bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Email report'}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Sends {report.from} to {report.to} as shown above. Separate several addresses with commas.
              </p>
              {sendResult ? (
                <p
                  role="status"
                  className={`mt-2 text-sm ${sendResult.ok ? 'text-emerald-700' : 'text-red-700'}`}
                >
                  {sendResult.text}
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function OverShortReportPageRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-500">Loading…</div>}>
      <OverShortReportPage />
    </Suspense>
  )
}
