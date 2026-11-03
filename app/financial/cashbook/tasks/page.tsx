'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CASHBOOK_ACCOUNTS, CASHBOOK_ACCOUNT_INFO, cashbookAccountLabel, type CashbookAccount } from '@/lib/cashbook-accounts'
import type { TaskKind, TaskPrefill, TaskRoute } from '@/lib/cashbook-compare'

type TaskStatus = 'open' | 'done' | 'dismissed'

type TaskRow = {
  id: string
  kind: TaskKind
  account: string
  status: TaskStatus
  title: string
  detail: string
  date: string | null
  amount: number | null
  ref: string
  route: TaskRoute
  canCreate: boolean
  resolution: string
  payload: { prefill?: TaskPrefill; toAccount?: CashbookAccount } | null
  entry: { id: string; account: string; date: string; description: string; amount: number } | null
}

type Counts = {
  open: number
  done: number
  dismissed: number
  openByAccount: Record<CashbookAccount, number>
}

type Balances = {
  sheetOpening: number | null
  appOpening: number
  sheetClosing: number | null
  appClosing: number | null
  difference: number | null
}

type SheetSummary = {
  account: CashbookAccount
  fileName: string
  periodStart: string
  periodEnd: string
  counts: {
    sheetLines: number
    matched: number
    missing: number
    wrongAccount: number
    differs: number
    cardDays: number
    extra: number
    issues: number
  }
  balances: Balances
  tasks: Array<{ fingerprint: string; kind: TaskKind; title: string; amount: number | null; date: string | null }>
  tasksSaved?: { created: number; reopened: number; closed: number; kept: number }
}

type UploadRow = {
  id: string
  account: string
  fileName: string
  periodStart: string
  periodEnd: string
  createdAt: string
  summaryJson: { counts?: SheetSummary['counts']; balances?: Balances } | null
}

function money(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function niceDate(ymd: string | null): string {
  if (!ymd) return '—'
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(ymd.slice(8, 10))} ${months[Number(ymd.slice(5, 7)) - 1]}`
}

const GROUPS: Array<{ key: string; label: string; help: string }> = [
  { key: 'missing_transfer', label: 'Transfers between the accounts', help: 'Both sheets show the money moving. One click records it as a linked transfer.' },
  { key: 'missing_entry:cashbook', label: 'Missing: enter in the cashbook', help: 'Expenses and receipts that have no other home. The form opens filled in.' },
  { key: 'missing_entry:vendor_payment', label: 'Missing: vendor payments', help: 'Pay or record these on the vendor invoice, so the batch, check and balance are created properly.' },
  { key: 'missing_entry:fuel_payment', label: 'Missing: fuel payments', help: 'Rubis and other fuel payments. Record them from Invoices & Payment.' },
  { key: 'missing_entry:payroll', label: 'Missing: payroll', help: 'Salary cheques and EFTs. Generate them from the pay run.' },
  { key: 'missing_entry:customer_payment', label: 'Missing: customer payments', help: 'These arrive from CStore. Import or sync the customer payments.' },
  { key: 'missing_entry:shift', label: 'Missing: deposits from shifts', help: 'These come from closing the shift. Check the shift is closed and the deposit slip is entered.' },
  { key: 'missing_entry:other', label: 'Missing: other', help: '' },
  { key: 'card_day', label: 'Card sales by day', help: 'Credit and debit card totals that differ from the shifts for that day.' },
  { key: 'wrong_account', label: 'On the wrong account', help: 'The cashbook has it, but under the other account. Move it.' },
  { key: 'amount_differs', label: 'Amount differs', help: 'Same line, different amount. Correct the cashbook or ask the accountant.' },
  { key: 'extra_in_app', label: 'In the cashbook, not on the sheet', help: 'Check it is on the right account, not a duplicate, or not yet recorded by the accountant.' },
  { key: 'sheet_issue', label: 'Problems in the sheet', help: 'Typos or gaps in the accountant\'s sheet. Take these back to the accountant.' },
  { key: 'opening_balance', label: 'Opening balance', help: '' }
]

function groupKey(task: TaskRow): string {
  if (task.kind !== 'missing_entry') return task.kind
  const known = ['cashbook', 'vendor_payment', 'fuel_payment', 'payroll', 'customer_payment', 'shift']
  return `missing_entry:${known.includes(task.route) ? task.route : 'other'}`
}

const OTHER_SCREENS: Partial<Record<TaskRoute, { href: string; label: string }>> = {
  vendor_payment: { href: '/vendor-payments/invoices', label: 'Open vendor payments' },
  fuel_payment: { href: '/payment-desk', label: 'Open invoices & payment' },
  payroll: { href: '/pay-run', label: 'Open pay run' },
  customer_payment: { href: '/customer-accounts', label: 'Open customer accounts' },
  shift: { href: '/shifts', label: 'Open shifts' }
}

function cashbookLink(task: TaskRow): string | null {
  const prefill = task.payload?.prefill
  if (!prefill) return null
  const params = new URLSearchParams({
    task: task.id,
    type: prefill.type,
    date: prefill.date,
    amount: String(prefill.amount),
    desc: prefill.description,
    ref: prefill.ref,
    pm: prefill.paymentMethod,
    account: prefill.account,
    hint: prefill.categoryHint
  })
  return `/financial/cashbook?${params.toString()}`
}

function BalanceBox({ summary }: { summary: SheetSummary }) {
  const b = summary.balances
  const off = b.difference != null && Math.abs(b.difference) > 0.005
  return (
    <table className="mt-2 text-sm">
      <tbody>
        <tr>
          <td className="pr-4 text-gray-500">Opening</td>
          <td className="pr-4 tabular-nums">Sheet {money(b.sheetOpening)}</td>
          <td className="tabular-nums">App {money(b.appOpening)}</td>
        </tr>
        <tr>
          <td className="pr-4 text-gray-500">Closing</td>
          <td className="pr-4 tabular-nums">Sheet {money(b.sheetClosing)}</td>
          <td className="tabular-nums">App {money(b.appClosing)}</td>
          <td className={`pl-4 font-semibold tabular-nums ${off ? 'text-red-700' : 'text-green-700'}`}>
            {b.difference == null ? '' : off ? `Difference ${money(b.difference)}` : 'Agrees'}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export default function CashbookTasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [status, setStatus] = useState<TaskStatus>('open')
  const [account, setAccount] = useState<'' | CashbookAccount>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rechecking, setRechecking] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<SheetSummary[] | null>(null)
  const [comparing, setComparing] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status })
    if (account) params.set('account', account)
    const res = await fetch(`/api/financial/cashbook/tasks?${params.toString()}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load tasks')
    setTasks(data.tasks as TaskRow[])
    setCounts(data.counts as Counts)
    setUploads(data.uploads as UploadRow[])
  }, [status, account])

  // Close anything that now matches before showing the list.
  const recheck = useCallback(async () => {
    const res = await fetch('/api/financial/cashbook/tasks/recheck', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to re-check')
    return data as { accounts: Array<{ closed: number; reopened: number; created: number }> }
  }, [])

  const firstLoad = useRef(true)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        if (firstLoad.current) {
          firstLoad.current = false
          await recheck().catch(() => undefined)
        }
        await load()
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tasks')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [load, recheck])

  const runRecheck = async () => {
    setRechecking(true)
    setError(null)
    setNotice(null)
    try {
      const result = await recheck()
      const closed = result.accounts.reduce((sum, item) => sum + item.closed, 0)
      const reopened = result.accounts.reduce((sum, item) => sum + item.reopened, 0)
      setNotice(
        result.accounts.length === 0
          ? 'No spreadsheet has been uploaded yet.'
          : `Checked against the cashbook. ${closed} now match${closed === 1 ? 'es' : ''}${reopened ? `, ${reopened} came back` : ''}.`
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-check')
    } finally {
      setRechecking(false)
    }
  }

  const send = async (url: string, init: RequestInit) => {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed')
    return data
  }

  const act = async (task: TaskRow, work: () => Promise<unknown>, done?: string) => {
    setBusyId(task.id)
    setError(null)
    setNotice(null)
    try {
      await work()
      if (done) setNotice(done)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusyId(null)
    }
  }

  const compare = async () => {
    if (files.length === 0) return
    setComparing(true)
    setError(null)
    setNotice(null)
    setPreview(null)
    try {
      const body = new FormData()
      files.forEach((file) => body.append('file', file))
      const res = await fetch('/api/financial/cashbook/uploads?preview=1', { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to compare')
      setPreview(data.sheets as SheetSummary[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compare')
    } finally {
      setComparing(false)
    }
  }

  const saveTasks = async () => {
    if (files.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const body = new FormData()
      files.forEach((file) => body.append('file', file))
      const res = await fetch('/api/financial/cashbook/uploads', { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      const saved = (data.sheets as SheetSummary[]).reduce(
        (sum, sheet) => sum + (sheet.tasksSaved?.created ?? 0) + (sheet.tasksSaved?.reopened ?? 0),
        0
      )
      setNotice(`${saved} task${saved === 1 ? '' : 's'} added or reopened.`)
      setPreview(null)
      setFiles([])
      if (fileRef.current) fileRef.current.value = ''
      setStatus('open')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, TaskRow[]>()
    for (const task of tasks) {
      const key = groupKey(task)
      map.set(key, [...(map.get(key) ?? []), task])
    }
    return GROUPS.filter((group) => map.has(group.key)).map((group) => ({ ...group, items: map.get(group.key) ?? [] }))
  }, [tasks])

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/financial/cashbook" className="mb-3 inline-block text-sm text-indigo-700 hover:underline">
          ← Cashbook
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Spreadsheet tasks</h1>
        <p className="mt-1 mb-4 text-sm text-gray-600">
          Upload the accountant&apos;s cash book sheets. Anything that does not match the cashbook becomes a task.
          Nothing is added for you, so the batches, balances and payroll behind each line are created properly. Finish a
          task through its normal screen and it closes by itself on the next check.
        </p>

        {error ? <p className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {notice ? <p className="mb-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p> : null}

        <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Compare a spreadsheet</h2>
          <p className="mt-1 text-xs text-gray-600">
            Choose the Westline and Service Station sheets together so a transfer between them is seen as one thing.
            The account is read from the sheet heading.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx"
              multiple
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []).slice(0, 2))
                setPreview(null)
              }}
              className="text-sm"
            />
            <button
              type="button"
              onClick={() => void compare()}
              disabled={files.length === 0 || comparing}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {comparing ? 'Comparing…' : 'Compare'}
            </button>
          </div>

          {preview ? (
            <div className="mt-4 space-y-4">
              {preview.map((sheet) => (
                <div key={sheet.account} className="rounded border border-gray-200 p-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {cashbookAccountLabel(sheet.account)} · {sheet.fileName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {niceDate(sheet.periodStart)} to {niceDate(sheet.periodEnd)} · {sheet.counts.sheetLines} lines
                  </p>
                  <BalanceBox summary={sheet} />
                  <ul className="mt-2 grid gap-x-6 text-sm text-gray-800 sm:grid-cols-2">
                    <li>{sheet.counts.matched} lines already match</li>
                    <li>{sheet.counts.missing} missing from the cashbook</li>
                    <li>{sheet.counts.cardDays} card days to check</li>
                    <li>{sheet.counts.wrongAccount} on the wrong account</li>
                    <li>{sheet.counts.differs} with a different amount</li>
                    <li>{sheet.counts.extra} in the cashbook but not on the sheet</li>
                    <li>{sheet.counts.issues} problems in the sheet</li>
                  </ul>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveTasks()}
                  disabled={saving}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : `Create ${preview.reduce((sum, sheet) => sum + sheet.tasks.length, 0)} tasks`}
                </button>
                <button type="button" onClick={() => setPreview(null)} className="text-sm text-gray-600 hover:underline">
                  Cancel
                </button>
                <span className="text-xs text-gray-500">
                  Uploading the same sheet again does not repeat tasks. Fixed ones close, and ones you dismissed stay dismissed.
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
            {(['open', 'done', 'dismissed'] as TaskStatus[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={`rounded-md px-3 py-1 font-medium capitalize ${
                  status === key ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {key} {counts ? `(${counts[key]})` : ''}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
            {(['', ...CASHBOOK_ACCOUNTS] as Array<'' | CashbookAccount>).map((key) => (
              <button
                key={key || 'all'}
                type="button"
                onClick={() => setAccount(key)}
                className={`rounded-md px-3 py-1 font-medium ${
                  account === key ? 'bg-slate-700 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {key ? CASHBOOK_ACCOUNT_INFO[key].label : 'Both accounts'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void runRecheck()}
            disabled={rechecking}
            className="rounded border border-indigo-600 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          >
            {rechecking ? 'Checking…' : 'Re-check against the cashbook'}
          </button>
        </div>

        {uploads.length > 0 ? (
          <p className="mb-3 text-xs text-gray-500">
            Last uploads:{' '}
            {uploads
              .slice(0, 3)
              .map((upload) => `${cashbookAccountLabel(upload.account)} ${niceDate(upload.periodEnd)} (${upload.fileName})`)
              .join(' · ')}
          </p>
        ) : null}

        {loading ? (
          <p className="text-gray-600">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
            {status === 'open'
              ? uploads.length === 0
                ? 'No tasks yet. Upload a spreadsheet above.'
                : 'Nothing open. The cashbook matches the sheet.'
              : `No ${status} tasks.`}
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <details key={group.key} open={grouped.length <= 3 || group.items.length <= 12} className="rounded-lg border border-gray-200 bg-white">
                <summary className="cursor-pointer px-4 py-3">
                  <span className="text-sm font-semibold text-gray-900">{group.label}</span>
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{group.items.length}</span>
                  {group.help ? <span className="mt-0.5 block text-xs font-normal text-gray-500">{group.help}</span> : null}
                </summary>
                <ul className="divide-y divide-gray-100 border-t border-gray-100">
                  {group.items.map((task) => {
                    const link = task.route === 'cashbook' ? cashbookLink(task) : null
                    const other = OTHER_SCREENS[task.route]
                    const busy = busyId === task.id
                    return (
                      <li key={task.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{task.title}</p>
                          <p className="mt-0.5 text-xs text-gray-600">{task.detail}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {cashbookAccountLabel(task.account)} · {niceDate(task.date)}
                            {task.ref ? ` · ref ${task.ref}` : ''}
                            {task.amount != null ? ` · ${money(task.amount)}` : ''}
                          </p>
                          {task.entry ? (
                            <p className="mt-0.5 text-xs text-gray-500">
                              Cashbook entry: {niceDate(task.entry.date)} · {task.entry.description} · {money(task.entry.amount)} ·{' '}
                              {cashbookAccountLabel(task.entry.account)}
                            </p>
                          ) : null}
                          {task.status !== 'open' && task.resolution ? (
                            <p className="mt-0.5 text-xs italic text-gray-500">{task.resolution}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {task.status === 'open' ? (
                            <>
                              {task.canCreate ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(task, () => send(`/api/financial/cashbook/tasks/${task.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'create' }) }), 'Created.')
                                  }
                                  className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                  Create it
                                </button>
                              ) : null}
                              {task.kind === 'wrong_account' && task.payload?.toAccount ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(task, () => send(`/api/financial/cashbook/tasks/${task.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'move' }) }), 'Moved.')
                                  }
                                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  Move to {cashbookAccountLabel(task.payload.toAccount)}
                                </button>
                              ) : null}
                              {link ? (
                                <Link href={link} className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
                                  Add in cashbook
                                </Link>
                              ) : null}
                              {other ? (
                                <Link href={other.href} className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
                                  {other.label}
                                </Link>
                              ) : null}
                              {task.entry ? (
                                <Link
                                  href="/financial/cashbook"
                                  className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                  Open cashbook
                                </Link>
                              ) : null}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void act(task, () => send(`/api/financial/cashbook/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done', resolution: 'Marked done by hand.' }) }))
                                }
                                className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Done
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  const reason = window.prompt('Why is this being dismissed?')
                                  if (!reason || !reason.trim()) return
                                  void act(task, () => send(`/api/financial/cashbook/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'dismissed', resolution: reason.trim() }) }))
                                }}
                                className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Dismiss
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void act(task, () => send(`/api/financial/cashbook/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) }))
                              }
                              className="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
