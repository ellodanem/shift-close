'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { formatAmount } from '@/lib/fuelPayments'
import type { ReconcileView } from '@/lib/bank-reconcile'
import { useAccountingBooks } from '../books-context'

function money(amount: number): string {
  return formatAmount(amount)
}

function sameMoney(raw: string, amount: number): boolean {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && Math.abs(parsed - amount) < 0.001
}

export function ReconcileScreen() {
  const { reload: reloadBooks } = useAccountingBooks()
  const [view, setView] = useState<ReconcileView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [statementEndDate, setStatementEndDate] = useState(businessTodayYmd())
  const [statementEndBalance, setStatementEndBalance] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')

  const [lineKind, setLineKind] = useState<'fee' | 'interest'>('fee')
  const [lineDate, setLineDate] = useState(businessTodayYmd())
  const [lineDescription, setLineDescription] = useState('')
  const [lineAmount, setLineAmount] = useState('')
  const [lineRef, setLineRef] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/accounting/reconcile', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load reconciliation')
    return data as ReconcileView
  }, [])

  useEffect(() => {
    let cancelled = false
    void load()
      .then((data) => {
        if (!cancelled) setView(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load reconciliation')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    const session = view?.session
    if (!session) return
    setStatementEndDate(session.statementEndDate)
    setStatementEndBalance(String(session.statementEndBalance))
    setOpeningBalance(String(session.openingBalance))
    setLineDate(session.statementEndDate)
  }, [
    view?.session?.id,
    view?.session?.statementEndDate,
    view?.session?.statementEndBalance,
    view?.session?.openingBalance
  ])

  async function run(key: string, work: () => Promise<ReconcileView>, done?: string) {
    setBusy(key)
    setError(null)
    setMessage(null)
    try {
      const next = await work()
      setView(next)
      if (done) setMessage(done)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  async function post(url: string, body: unknown): Promise<ReconcileView> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed')
    return data as ReconcileView
  }

  async function patch(body: unknown): Promise<ReconcileView> {
    const res = await fetch('/api/accounting/reconcile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed')
    return data as ReconcileView
  }

  const session = view?.session
  const openingLocked = view?.openingLocked ?? false
  const statementDirty = Boolean(
    session &&
      (statementEndDate !== session.statementEndDate ||
        !sameMoney(statementEndBalance, session.statementEndBalance) ||
        (!openingLocked && !sameMoney(openingBalance, session.openingBalance)))
  )
  const startOpening = openingLocked ? view?.openingBalance : Number(openingBalance)
  const canStart =
    Boolean(statementEndDate) &&
    Number.isFinite(Number(statementEndBalance)) &&
    statementEndBalance.trim() !== '' &&
    (openingLocked ? view?.openingBalance != null : Number.isFinite(startOpening) && openingBalance.trim() !== '')

  if (loading) return <p className="text-gray-600">Loading reconciliation…</p>
  if (!view) return <p className="text-sm text-red-700">{error || 'Failed to load reconciliation'}</p>

  return (
    <div>
      <Link href="/accounting" className="mb-3 inline-block text-sm text-indigo-700 hover:underline">
        ← Back
      </Link>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Reconcile · 101 Westline</h1>
        <p className="mt-1 text-sm text-gray-600">
          Tick a line when it is on the bank statement. Finish when the difference is zero. The shift amount stays as it was counted.
        </p>
      </div>
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-green-700">{message}</p> : null}

      {!session ? (
        <form
          className="max-w-xl rounded-lg border border-gray-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void run('start', () =>
              post('/api/accounting/reconcile', {
                statementEndDate,
                statementEndBalance: Number(statementEndBalance),
                openingBalance: openingLocked ? view.openingBalance : Number(openingBalance)
              })
            )
          }}
        >
          <p className="mb-3 text-sm text-gray-600">
            Type the statement end date and ending balance from the bank statement.
          </p>
          {openingLocked && view.lastStatementEndDate ? (
            <p className="mb-3 text-sm text-gray-800">
              Opening balance {money(view.openingBalance ?? 0)} from the statement ended {view.lastStatementEndDate}.
            </p>
          ) : (
            <label className="mb-3 block text-sm">
              <span className="text-gray-600">Opening book balance</span>
              <span className="mt-1 block text-xs text-gray-500">
                The balance before the lines on this statement. Often the previous statement ending balance, if the books were caught up.
              </span>
              <input
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              />
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-gray-600">Statement end date</span>
              <input
                type="date"
                value={statementEndDate}
                onChange={(event) => setStatementEndDate(event.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Statement end balance</span>
              <input
                value={statementEndBalance}
                onChange={(event) => setStatementEndBalance(event.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy === 'start' || !canStart}
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'start' ? 'Starting…' : 'Start reconciliation'}
          </button>
        </form>
      ) : (
        <>
          <div className="mb-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-gray-600">Statement end date</span>
              <input
                type="date"
                value={statementEndDate}
                onChange={(event) => setStatementEndDate(event.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Statement end balance</span>
              <input
                value={statementEndBalance}
                onChange={(event) => setStatementEndBalance(event.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              />
            </label>
            {openingLocked ? (
              <div className="text-sm">
                <p className="text-gray-600">Opening balance</p>
                <p className="mt-2 font-semibold tabular-nums text-gray-900">{money(session.openingBalance)}</p>
              </div>
            ) : (
              <label className="block text-sm">
                <span className="text-gray-600">Opening book balance</span>
                <input
                  value={openingBalance}
                  onChange={(event) => setOpeningBalance(event.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
            )}
            {statementDirty ? (
              <div className="sm:col-span-3">
                <button
                  type="button"
                  disabled={busy === 'update'}
                  onClick={() =>
                    void run('update', () =>
                      patch({
                        statementEndDate,
                        statementEndBalance: Number(statementEndBalance),
                        ...(openingLocked ? {} : { openingBalance: Number(openingBalance) })
                      })
                    )
                  }
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 disabled:opacity-50"
                >
                  {busy === 'update' ? 'Saving…' : 'Update statement'}
                </button>
              </div>
            ) : null}
          </div>

          <div className="mb-2 flex flex-wrap gap-6">
            <div>
              <p className="text-lg font-semibold tabular-nums text-gray-900">{money(session.statementEndBalance)}</p>
              <p className="text-xs text-gray-500">Statement end balance</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-gray-900">{money(session.bookBalance)}</p>
              <p className="text-xs text-gray-500">Shift Close balance</p>
            </div>
            <div>
              <p className={`text-lg font-semibold tabular-nums ${session.balanced ? 'text-green-700' : 'text-amber-700'}`}>
                {money(session.difference)}
              </p>
              <p className="text-xs text-gray-500">Difference</p>
            </div>
          </div>
          <p className="mb-4 text-xs text-gray-500">
            Difference is the statement balance minus the opening balance and the lines you have ticked. Leave a line open when the bank has not taken it yet.
          </p>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2 text-right">Deposit</th>
                  <th className="px-3 py-2 text-right">Withdrawal</th>
                </tr>
              </thead>
              <tbody>
                {session.lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                      No Westline lines on or before this statement date.
                    </td>
                  </tr>
                ) : (
                  session.lines.map((line) => (
                    <tr key={line.cashbookEntryId} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={line.cleared}
                          disabled={busy === line.cashbookEntryId}
                          aria-label={`Cleared ${line.description}`}
                          onChange={(event) =>
                            void run(line.cashbookEntryId, () =>
                              patch({ cashbookEntryId: line.cashbookEntryId, cleared: event.target.checked })
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">{line.date}</td>
                      <td className="px-3 py-2">{line.description}</td>
                      <td className="px-3 py-2">{line.ref || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{line.deposit ? money(line.deposit) : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{line.withdrawal ? money(line.withdrawal) : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <form
            className="mt-6 rounded-lg border border-gray-200 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault()
              void run(
                'add',
                async () => {
                  const next = await post('/api/accounting/reconcile/entry', {
                    kind: lineKind,
                    date: lineDate,
                    description: lineDescription,
                    amount: Number(lineAmount),
                    ref: lineRef
                  })
                  setLineDescription('')
                  setLineAmount('')
                  setLineRef('')
                  reloadBooks()
                  return next
                },
                'Added to the cashbook. Tick it if it is on the statement.'
              )
            }}
          >
            <h2 className="text-sm font-semibold text-gray-900">On the statement, not in the books</h2>
            <p className="mb-3 mt-1 text-xs text-gray-500">A bank fee or interest. It posts to the cashbook, then you tick it.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-gray-600">Kind</span>
                <select
                  value={lineKind}
                  onChange={(event) => setLineKind(event.target.value === 'interest' ? 'interest' : 'fee')}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                >
                  <option value="fee">Bank fee</option>
                  <option value="interest">Interest</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Date</span>
                <input
                  type="date"
                  value={lineDate}
                  onChange={(event) => setLineDate(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-gray-600">Description</span>
                <input
                  value={lineDescription}
                  onChange={(event) => setLineDescription(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Amount</span>
                <input
                  value={lineAmount}
                  onChange={(event) => setLineAmount(event.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Ref</span>
                <input
                  value={lineRef}
                  onChange={(event) => setLineRef(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy === 'add' || !lineDescription.trim() || !(Number(lineAmount) > 0) || !lineDate}
              className="mt-3 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 disabled:opacity-50"
            >
              {busy === 'add' ? 'Adding…' : 'Add line'}
            </button>
          </form>

          <button
            type="button"
            disabled={!session.balanced || busy === 'finish' || statementDirty}
            onClick={() =>
              void run(
                'finish',
                async () => {
                  const next = await post('/api/accounting/reconcile/finish', {})
                  reloadBooks()
                  return next
                },
                'Reconciliation finished. Ticked lines are locked to this statement.'
              )
            }
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'finish' ? 'Finishing…' : 'Finish reconciliation'}
          </button>
        </>
      )}
    </div>
  )
}
