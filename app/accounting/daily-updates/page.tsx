'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAccountingBooks } from '../books-context'
import { formatAccountingDate } from '@/lib/accounting-date-format'
import {
  ACCOUNTANT_DAILY_REVIEWED_EVENT,
  ACCOUNTANT_DAILY_REVIEWED_KEY,
  type AccountantDailyLine,
  type AccountantDailyUpdate
} from '@/lib/accountant-daily-updates'
import { formatAmount } from '@/lib/fuelPayments'

function readReviewed(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTANT_DAILY_REVIEWED_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function AmountList({ lines }: { lines: AccountantDailyLine[] }) {
  if (lines.length === 0) return <p className="text-sm text-slate-400">None recorded</p>
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => (
        <div key={`${line.shiftId}:${index}`} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-slate-500">{line.shift}</span>
          <span className="font-semibold tabular-nums text-slate-900">{formatAmount(line.amount)}</span>
        </div>
      ))}
    </div>
  )
}

function TotalCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums">{formatAmount(value)}</p>
    </div>
  )
}

export default function AccountantDailyUpdatesPage() {
  const { month } = useAccountingBooks()
  const [days, setDays] = useState<AccountantDailyUpdate[]>([])
  const [reviewed, setReviewed] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setReviewed(readReviewed()), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetch(`/api/accounting/daily-updates?month=${encodeURIComponent(month)}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Could not load daily updates')
        if (!cancelled) setDays(Array.isArray(data) ? data : [])
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load daily updates')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [month])

  const unreadCount = useMemo(
    () => days.filter((day) => reviewed[day.date] !== day.fingerprint).length,
    [days, reviewed]
  )

  function markReviewed(day: AccountantDailyUpdate) {
    setReviewed((current) => {
      const next = { ...current, [day.date]: day.fingerprint }
      try {
        localStorage.setItem(ACCOUNTANT_DAILY_REVIEWED_KEY, JSON.stringify(next))
        window.dispatchEvent(new Event(ACCOUNTANT_DAILY_REVIEWED_EVENT))
      } catch {
        // The visual state still updates when browser storage is unavailable.
      }
      return next
    })
  }

  return (
    <div>
      <Link href="/accounting" className="mb-3 inline-block text-sm text-indigo-700 hover:underline">← Back</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Daily updates</h1>
            {unreadCount > 0 ? (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-sm font-bold text-white" title={`${unreadCount} new or updated day${unreadCount === 1 ? '' : 's'}`}>
                !
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            The familiar end-of-day note, built automatically from completed shifts. A day is marked new again when another shift closes or its figures change.
          </p>
        </div>
        {unreadCount > 0 ? <p className="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700">{unreadCount} to review</p> : null}
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading daily updates…</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {!loading && !error && days.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No completed shifts were found for this month.
        </div>
      ) : null}

      <div className="space-y-5">
        {days.map((day) => {
          const unread = reviewed[day.date] !== day.fingerprint
          return (
            <article key={day.date} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${unread ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200'}`}>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-900">{formatAccountingDate(day.date)}</h2>
                  {unread ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 font-bold text-white" aria-label="New or updated day">!</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{day.shifts.map((shift) => shift.label).join(' · ')}</span>
                  {unread ? (
                    <button type="button" onClick={() => markReviewed(day)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                      Mark reviewed
                    </button>
                  ) : <span className="text-xs font-medium text-emerald-700">Reviewed</span>}
                </div>
              </header>

              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
                <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-blue-800">Deposits</h3>
                  <AmountList lines={day.deposits} />
                </section>
                <section className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-violet-800">Credit</h3>
                  <AmountList lines={day.credits} />
                </section>
                <section className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-cyan-800">Debit</h3>
                  <AmountList lines={day.debits} />
                </section>
              </div>
              <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 sm:px-5">
                <TotalCard label="Gasoline sold" value={day.gasoline} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
                <TotalCard label="Diesel sold" value={day.diesel} tone="border-amber-200 bg-amber-50 text-amber-900" />
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
