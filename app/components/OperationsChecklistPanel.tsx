'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/components/AuthContext'
import { canAccessOperationsChecklist } from '@/lib/operations-checklist-access'
import type {
  ChecklistItem,
  ChecklistSubtask,
  OperationsChecklistPayload
} from '@/lib/operations-checklist-types'
import { shouldRefetchOnVisibility } from '@/lib/refetch-on-visibility'

const POLL_MS = 4 * 60 * 1000
const GROUPED_ITEM_IDS = new Set(['shift-close', 'customer-accounts'])

const STATUS_STYLES: Record<string, string> = {
  complete: 'bg-emerald-100 text-emerald-800',
  not_due: 'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-100 text-blue-800',
  incomplete: 'bg-yellow-100 text-yellow-900',
  due: 'bg-amber-100 text-amber-900',
  overdue: 'bg-red-100 text-red-800',
  reopened: 'bg-orange-100 text-orange-900',
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
        : status === 'reopened'
          ? 'bg-orange-500'
          : status === 'incomplete'
            ? 'bg-yellow-500'
            : status === 'due'
              ? 'bg-amber-500'
              : status === 'in_progress'
                ? 'bg-blue-500'
                : 'bg-slate-300'
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ring}`} aria-hidden />
}

function itemBadgeCount(item: ChecklistItem): number {
  if (item.children?.length) {
    return item.children.reduce((n, c) => n + c.badgeWeight, 0)
  }
  return item.badgeWeight
}

function totalBadgeCount(items: ChecklistItem[]): number {
  return items.reduce((n, item) => n + itemBadgeCount(item), 0)
}

type PostAckFn = (
  taskId: string,
  weekKey: string,
  kind: 'complete',
  options?: { note?: string; overrideZeroCharges?: boolean }
) => Promise<void>

function CollapsibleSubtaskSection({
  title,
  subtasks,
  taskId,
  postAck
}: {
  title: string
  subtasks: ChecklistSubtask[]
  taskId: string
  postAck?: PostAckFn
}) {
  const [expanded, setExpanded] = useState(false)
  const openCount = subtasks.reduce((n, s) => n + s.badgeWeight, 0)

  if (subtasks.length === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-slate-100/80"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        <span className="text-[10px] text-slate-400">({subtasks.length})</span>
        {openCount > 0 ? (
          <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            {openCount}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <ul className="mt-1 space-y-1">
          {subtasks.map((sub) => (
            <li key={sub.id} className="rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5">
              <div className="flex items-start gap-2">
                <StatusDot status={sub.status} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={sub.href}
                    className="text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline"
                  >
                    {sub.label}
                  </Link>
                  {sub.reason ? (
                    <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{sub.reason}</p>
                  ) : null}
                  <span
                    className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[sub.status] ?? STATUS_STYLES.not_due}`}
                  >
                    {sub.status.replace(/_/g, ' ')}
                  </span>
                  {postAck && sub.weekKey && sub.actions?.includes('mark_complete') ? (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                        onClick={() => void postAck(taskId, sub.weekKey!, 'complete')}
                      >
                        Mark complete
                      </button>
                    </div>
                  ) : null}
                  {postAck && sub.weekKey && sub.actions?.includes('mark_complete_with_note') ? (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                        onClick={() => {
                          const note = window.prompt(
                            'No accounts with charges. Enter a note (min 10 characters) to mark complete:'
                          )
                          if (note === null) return
                          void postAck(taskId, sub.weekKey!, 'complete', {
                            note,
                            overrideZeroCharges: true
                          })
                        }}
                      >
                        Complete with note
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function GroupedChecklistItem({
  item,
  onNavigate,
  postAck
}: {
  item: ChecklistItem
  onNavigate: () => void
  postAck?: PostAckFn
}) {
  const children = item.children ?? []
  const currentWeek = children.filter((c) => c.bucket === 'current_week')
  const backlog = children.filter((c) => c.bucket === 'backlog')
  const openCount = itemBadgeCount(item)

  return (
    <li className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <StatusDot status={item.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={item.href}
              className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
              onClick={onNavigate}
            >
              {item.label}
            </Link>
            {openCount > 0 ? (
              <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {openCount}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-600">{item.summary}</p>
          {openCount === 0 ? (
            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES.complete}`}>
              complete
            </span>
          ) : (
            <>
              <CollapsibleSubtaskSection
                title="This week"
                subtasks={currentWeek}
                taskId={item.id}
                postAck={postAck}
              />
              <CollapsibleSubtaskSection title="Backlog" subtasks={backlog} taskId={item.id} postAck={postAck} />
            </>
          )}
        </div>
      </div>
    </li>
  )
}

function FlatChecklistItem({
  item,
  onNavigate,
  postAck
}: {
  item: ChecklistItem
  onNavigate: () => void
  postAck: PostAckFn
}) {
  return (
    <li className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <StatusDot status={item.status} />
        <div className="min-w-0 flex-1">
          <Link
            href={item.href}
            className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
            onClick={onNavigate}
          >
            {item.label}
          </Link>
          {item.summary ? <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{item.summary}</p> : null}
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
                onClick={() => void postAck(item.id.replace(/:.*$/, ''), item.weekKey!, 'complete')}
              >
                In progress
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export default function OperationsChecklistPanel() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<OperationsChecklistPayload | null>(null)
  const [fetching, setFetching] = useState(false)
  const tabHiddenAtRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (!user || !canAccessOperationsChecklist({ role: user.role, isSuperAdmin: user.isSuperAdmin })) return
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
    if (loading || !user || !canAccessOperationsChecklist({ role: user.role, isSuperAdmin: user.isSuperAdmin })) return
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

  const postAck: PostAckFn = async (taskId, weekKey, kind, options) => {
    const res = await fetch('/api/operations-checklist/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        weekKey,
        kind,
        note: options?.note,
        overrideZeroCharges: options?.overrideZeroCharges
      })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      window.alert(typeof err.error === 'string' ? err.error : 'Could not save checklist acknowledgement.')
      return
    }
    void load()
  }

  if (loading || !user || !canAccessOperationsChecklist({ role: user.role, isSuperAdmin: user.isSuperAdmin })) {
    return null
  }

  const badgeCount = totalBadgeCount(data?.items ?? [])

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
            ) : (
              <ul className="space-y-2">
                {(data?.items ?? []).map((item) =>
                  GROUPED_ITEM_IDS.has(item.id) ? (
                    <GroupedChecklistItem
                      key={item.id}
                      item={item}
                      onNavigate={() => setOpen(false)}
                      postAck={item.id === 'customer-accounts' ? postAck : undefined}
                    />
                  ) : (
                    <FlatChecklistItem
                      key={item.id}
                      item={item}
                      onNavigate={() => setOpen(false)}
                      postAck={postAck}
                    />
                  )
                )}
              </ul>
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
