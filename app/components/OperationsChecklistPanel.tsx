'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/components/AuthContext'
import { canAccessOperationsChecklist } from '@/lib/operations-checklist-access'
import type { ChecklistItem, OperationsChecklistPayload } from '@/lib/operations-checklist-types'
import { shouldRefetchOnVisibility } from '@/lib/refetch-on-visibility'

const POLL_MS = 4 * 60 * 1000

const STATUS_STYLES: Record<string, string> = {
  complete: 'bg-emerald-100 text-emerald-800',
  not_due: 'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-100 text-blue-800',
  due: 'bg-amber-100 text-amber-900',
  overdue: 'bg-red-100 text-red-800',
  blocked: 'bg-slate-100 text-slate-600',
  discrepancy: 'bg-amber-100 text-red-800',
  na: 'bg-slate-50 text-slate-400'
}

function StatusDot({ status }: { status: string }) {
  const ring =
    status === 'complete'
      ? 'bg-emerald-500'
      : status === 'overdue' || status === 'discrepancy'
        ? 'bg-red-500'
        : status === 'due'
          ? 'bg-amber-500'
          : status === 'in_progress'
            ? 'bg-blue-500'
            : 'bg-slate-300'
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ring}`} aria-hidden />
}

function groupItems(items: ChecklistItem[]) {
  const today: ChecklistItem[] = []
  const soon: ChecklistItem[] = []
  const week: ChecklistItem[] = []
  for (const item of items) {
    if (item.section === 'today') today.push(item)
    else if (item.section === 'soon') soon.push(item)
    else week.push(item)
  }
  return { today, soon, week }
}

export default function OperationsChecklistPanel() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<OperationsChecklistPayload | null>(null)
  const [fetching, setFetching] = useState(false)
  const tabHiddenAtRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (!user || !canAccessOperationsChecklist(user.role)) return
    setFetching(true)
    try {
      const res = await fetch('/api/operations-checklist', { cache: 'no-store' })
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // ignore transient errors
    } finally {
      setFetching(false)
    }
  }, [user])

  useEffect(() => {
    if (loading || !user || !canAccessOperationsChecklist(user.role)) return
    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load, loading, user])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now()
        return
      }
      if (document.visibilityState === 'visible' && shouldRefetchOnVisibility(tabHiddenAtRef.current)) {
        tabHiddenAtRef.current = null
        void load()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const postAck = async (taskId: string, weekKey: string, kind: 'started' | 'complete') => {
    await fetch('/api/operations-checklist/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, weekKey, kind })
    })
    void load()
  }

  if (loading || !user || !canAccessOperationsChecklist(user.role)) return null

  const badgeCount = data?.items.reduce((n, i) => n + i.badgeWeight, 0) ?? 0
  const grouped = groupItems(data?.items ?? [])

  const renderSection = (title: string, list: ChecklistItem[]) => {
    if (list.length === 0) return null
    return (
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        <ul className="space-y-1.5">
          {list.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 text-sm shadow-sm"
            >
              <div className="flex items-start gap-2">
                <StatusDot status={item.status} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={item.href}
                    className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                  {item.summary ? (
                    <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{item.summary}</p>
                  ) : null}
                  <span
                    className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[item.status] ?? STATUS_STYLES.not_due}`}
                  >
                    {item.status.replace(/_/g, ' ')}
                  </span>
                  {item.actions?.includes('mark_in_progress') && item.weekKey ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-100"
                        onClick={() =>
                          void postAck(item.id.replace(/:.*$/, ''), item.weekKey!, 'started')
                        }
                      >
                        In progress
                      </button>
                      <button
                        type="button"
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                        onClick={() =>
                          void postAck(item.id.replace(/:.*$/, ''), item.weekKey!, 'complete')
                        }
                      >
                        Mark complete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
      {open ? (
        <div
          className="pointer-events-auto flex max-h-[min(70vh,520px)] w-[min(100vw-2rem,380px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-xl"
          role="dialog"
          aria-label="Operations checklist"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">Operations checklist</h2>
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Collapse checklist"
              onClick={() => setOpen(false)}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          <div className="scrollbar-subtle flex-1 overflow-y-auto px-3 py-3">
            {fetching && !data ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-emerald-700">All caught up.</p>
            ) : (
              <>
                {renderSection('Due today', grouped.today)}
                {renderSection('Due soon', grouped.soon)}
                {renderSection('This week', grouped.week)}
              </>
            )}
            {data?.counts.inProgress ? (
              <p className="mt-2 text-xs text-blue-700">{data.counts.inProgress} in progress</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-lg hover:bg-slate-50"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="relative flex h-2 w-2">
          {badgeCount > 0 ? (
            <span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          ) : null}
        </span>
        Checklist
        {fetching ? <span className="text-xs font-normal text-slate-400">…</span> : null}
      </button>
    </div>
  )
}
